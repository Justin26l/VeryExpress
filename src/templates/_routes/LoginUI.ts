// {{headerComment}}
import { Router, Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

import { externalIdentityUI } from "./ExternalIdentityUI.gen";

/**
 * Explain config values that `process.env` does not have.
 *
 * Two different situations produce the same symptom — the broker reports itself unconfigured — and they
 * need different fixes, so they are separated here:
 *
 * - **present in `.env` but absent from `process.env`**: `dotenv` does not override a variable that is
 *   already set in the environment, and it only runs once at startup. Either the process started before
 *   the file was edited (the dev watcher used to watch TypeScript only, so a `.env` edit did not reload),
 *   or the name is exported by the shell / IDE launch config / container with a different value.
 * - **absent from both**: nothing has set it.
 *
 * Pure so the diagnosis can be tested without touching the filesystem.
 */
export function diagnoseMissingEnv(
    names: string[],
    envFile: Record<string, string | undefined>,
): string[] {
    const shadowed = names.filter((name) => envFile[name]);
    const unset = names.filter((name) => !envFile[name]);
    const problems: string[] = [];

    if (shadowed.length > 0) {
        problems.push(
            `set in .env but NOT in process.env: ${shadowed.join(", ")}. dotenv does not override a ` +
            "variable that is already present in the environment, and .env is read once at startup — so " +
            "either the server started before .env was edited, or these are exported by the shell / IDE " +
            `launch config / container. Check \`env | grep -E '^(${shadowed.join("|")})='\`` +
            ", then unset them there or pass dotenv's `override` option in server.ts.",
        );
    }

    if (unset.length > 0) {
        problems.push(`not set in .env or process.env: ${unset.join(", ")}`);
    }

    return problems;
}

export interface LoginUIConfig {
    localAuth: boolean;
    oauthProviders: string[];
    /**
     * Serve the self-service deletion page at `/delete_account`.
     *
     * Optional and defaulting to true so an app generated before this feature existed still
     * constructs — its `server.ts` is generated once and is not overwritten on later runs.
     */
    deleteAccount?: boolean;

    /**
     * Override the external-identity (broker SSO) login wiring.
     *
     * Unnecessary in the normal case: `auth.externalIdentity` in `vex.config.json` makes the generator
     * emit a complete default into `ExternalIdentityUI.gen.ts`, which this page falls back to. This
     * field exists for the cases the generator cannot know — hand-editing the button label, pointing at
     * a self-hosted SDK build, or wiring a broker that has no preset.
     */
    externalIdentity?: ExternalIdentityUI;
}

/**
 * Everything the login page needs to drive a broker, as emitted into `ExternalIdentityUI.gen.ts`.
 *
 * vex owns the button, the nonce'd script tags and the POST to `/api/auth/external`; the broker's own
 * browser code arrives as `initScript`, because how to call a vendor's JS SDK is the one thing that
 * cannot be generalised. Nothing here is secret — `config` is the broker's *public* browser config,
 * resolved from env at request time.
 */
export interface ExternalIdentityUI {
    /** Button text template; `{provider}` is replaced by the provider's label. */
    label: string;
    /** Browser SDK scripts, pinned to a version, loaded in order before `initScript`. */
    sdkScripts: string[];
    /**
     * Global the init script defines for starting a sign-in. `signIn(providerId)` resolves to an ID
     * token; in `redirect` mode the page navigates away and the promise never settles, so the caller
     * does not need to know the mode.
     */
    getToken: string;
    /** Global that completes a redirect sign-in: `resume()` resolves to an ID token, or `null`. */
    resumeRedirect: string;
    /** Which mode the page is in; passed to the browser so the SDK can choose. */
    signInMethod: "popup" | "redirect";
    /** Sign-in methods rendered as buttons, each passed to `getToken` as its `id`. */
    providers: { id: string; label: string }[];
    /** Public config key → env var name. Resolved at render time; missing values stay absent. */
    envKeys: Record<string, string>;
    /** Browser JS that initialises the SDK and defines `getToken`. */
    initScript: string;
    /**
     * Declarative checks on the resolved public config, applied server-side on each render.
     *
     * The broker's own errors for a misconfigured client are generic (Firebase's
     * `auth/internal-error` being the canonical example), so a knowable mistake should be named here
     * instead — in the server log, and in the message the browser shows.
     */
    configChecks?: externalIdentityConfigCheck[];
    /**
     * Extra CSP sources the broker's SDK needs on the login page.
     *
     * A nonce authorises the tags this page renders, but a broker SDK also injects scripts at runtime
     * (Firebase Auth loads `apis.google.com/js/api.js` for the popup handshake) and those carry no
     * nonce — so the hosts have to be allowed by name.
     */
    csp?: {
        scriptSrc?: string[];
    };
    /**
     * Where `sdkScripts` come from, when they are served from an installed npm package rather than a
     * CDN. `files` is the allowlist for the route, so the route cannot be walked out of the package.
     */
    sdkFromPackage?: {
        route: string;
        package: string;
        files: string[];
    };
}

export interface externalIdentityConfigCheck {
    /** Config key the check applies to. */
    key: string;
    warnIfMatches?: string;
    warnUnlessMatches?: string;
    /** What is wrong and what to do about it. */
    message: string;
}

export default class LoginUI {

    /** Last set of problems warned about, so a page render logs it once. */
    private static warnedEnvSignature = "";

    /** The parsed `.env`, read at most once per process. */
    private static envFileCache: Record<string, string> | undefined;

    private router: Router = Router();
    private config: LoginUIConfig;

    constructor(config: LoginUIConfig) {
        this.config = config;
        this.registerRoutes();
    }

    getRouter(): Router {
        return this.router;
    }

    private get deleteAccountEnabled(): boolean {
        return this.config.deleteAccount ?? true;
    }

    private registerRoutes(): void {
        this.router.get("/", this.homePage.bind(this));
        this.router.get("/login", this.loginPage.bind(this));
        this.router.get("/logout", this.logoutPage.bind(this));
        this.router.get("/mytokens", this.myTokensPage.bind(this));
        this.router.get("/refreshtoken", this.refreshTokenPage.bind(this));
        this.router.get("/logincallback", this.loginCallbackPage.bind(this));
        if (this.deleteAccountEnabled) {
            this.router.get("/delete_account", this.deleteAccountPage.bind(this));
        }

        const sdk = this.externalUI?.sdkFromPackage;
        if (sdk) {
            this.router.get(`${sdk.route}/:file`, this.brokerSdkFile.bind(this));
        }
    }

    /**
     * Serve the broker's SDK out of the installed npm package.
     *
     * Self-hosting it is what makes the SDK version npm's business and keeps the scripts same-origin —
     * no CDN host needs a CSP allowance, and the page works offline. The package is read from
     * `node_modules` at request time rather than copied at generation, because generation runs before
     * `npm install`.
     */
    private brokerSdkFile(req: Request, res: Response): void {
        const sdk = this.externalUI?.sdkFromPackage;
        const file = typeof req.params?.file === "string" ? req.params.file : "";

        res.setHeader("Content-Type", "text/plain; charset=utf-8");

        // allowlist, not sanitising: a name that is not declared is rejected outright
        if (!sdk || !sdk.files.includes(file)) {
            res.status(404).send("Unknown broker SDK file.");
            return;
        }

        const fullPath = path.join(process.cwd(), "node_modules", sdk.package, file);
        let body: string;
        try {
            body = fs.readFileSync(fullPath, "utf8");
        }
        catch {
            const message =
                `Broker SDK not found at ${fullPath}. Run \`npm install\` — it is declared as a ` +
                `dependency, so it is missing only because the install has not run.`;
            console.warn(`[vex] ${message}`);
            res.status(500).send(message);
            return;
        }

        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.send(body);
    }

    /**
     * Is the vendored broker SDK actually present?
     *
     * Worth checking at render time: the dependency is added to an existing project's `package.json` by
     * the generator, so the first run after upgrading has a page whose script tags 404 until `npm
     * install` runs.
     */
    private sdkProblems(external: ExternalIdentityUI): string[] {
        const sdk = external.sdkFromPackage;
        if (!sdk) return [];

        const missing = sdk.files.filter((file) =>
            !fs.existsSync(path.join(process.cwd(), "node_modules", sdk.package, file)));

        if (missing.length === 0) return [];

        return [
            `broker SDK not installed: ${missing.join(", ")}. It is declared as a dependency of ` +
            `"${sdk.package}" — run \`npm install\`.`,
        ];
    }

    private nonce(): string {
        return crypto.randomBytes(16).toString("base64");
    }

    /**
     * `script-src` for the login page: the page's own scripts plus whatever the broker's SDK needs.
     *
     * The extra hosts are not optional decoration — a broker SDK that injects a script without a nonce
     * fails silently behind this policy, and the only symptom is a generic authentication error. See
     * `ExternalIdentityUI.csp`.
     */
    private loginPageCsp(nonce: string): string {
        const extra = this.externalUI?.csp?.scriptSrc ?? [];
        const sources = ["'self'", `'nonce-${nonce}'`, ...extra.filter((host, i) => extra.indexOf(host) === i)];

        return `script-src ${sources.join(" ")}`;
    }

    /** Escape for HTML text/attribute context. The label comes from the app's own server.ts. */
    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    /**
     * The external-identity wiring in force: an explicit app override, else the generated default.
     *
     * The fallback is why `auth.externalIdentity` needs no `server.ts` edit — `server.ts` is written
     * once and never overwritten, so anything only reachable through it would not apply to an existing
     * project. This file and `ExternalIdentityUI.gen.ts` are both regenerated.
     */
    private get externalUI(): ExternalIdentityUI | undefined {
        return this.config.externalIdentity ?? externalIdentityUI;
    }

    /**
     * Auth is on when *any* sign-in path exists. `externalIdentity` counts: an app with
     * `localAuth: false` and no passport provider is not auth-less if a broker is configured, and
     * leaving it out of this test would hide the login link for exactly that app.
     */
    private get authEnabled(): boolean {
        return this.config.localAuth
            || this.config.oauthProviders.length > 0
            || !!this.externalUI;
    }

    private homePage(_req: Request, res: Response): void {
        const authLinks = this.authEnabled
            ? `<li><a href="/login">Login</a></li>
                    <li><a href="/mytokens">myTokens</a></li>
                    <li><a href="/refreshtoken">RefreshToken</a></li>
                    <li><a href="/logout">LogOut</a></li>`
            : "";

        const deleteAccountLink = this.deleteAccountEnabled
            ? `<li><a href="/delete_account">Delete account</a></li>`
            : "";

        res.send(`
            <div>
                <h1>Hello World</h1>
                <ul>
                    ${authLinks}
                    ${deleteAccountLink}
                    <li><a href="/swagger">Swagger UI</a></li>
                </ul>
                <h1>Others</h1>
                <ul>
                    <li><a href="/logincallback">logincallback</a></li>
                </ul>
            </div>
        `);
    }

    private loginPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", this.loginPageCsp(nonce));

        let formHtml = "";
        if (this.config.localAuth) {
            formHtml += `
                <p>Email:</p>
                <input type="email" id="email"/>
                <p>Password:</p>
                <input type="password" id="password"/>
                <br/><br/>
                <button id="localLoginBtn">Login</button>
                <button id="localRegisterBtn">Register</button>
                <br/><br/>`;
        }

        formHtml += "                <p>Login with SSO:</p>\n";
        const external = this.externalUI;
        if (this.config.oauthProviders.length === 0 && !external) {
            formHtml += "                <p>No OAuth provider configured.</p>\n";
        }
        else {
            // passport providers: server-driven redirect flows
            this.config.oauthProviders.forEach((provider) => {
                formHtml += `                <a href="/api/auth/${provider}">${provider}</a><br/>\n`;
            });

            // external identity: client-driven. One button per configured sign-in method; the
            // provider id travels to the glue as a data attribute, and on to getToken().
            if (external) {
                external.providers.forEach((provider) => {
                    const text = external.label.replace("{provider}", provider.label);
                    formHtml += `                <button class="externalLoginBtn" data-provider="${this.escapeHtml(provider.id)}">${this.escapeHtml(text)}</button><br/>\n`;
                });
            }
        }

        const scripts = this.externalIdentityScripts(nonce);
        const localAuthScript = this.config.localAuth
            ? `<script nonce="${nonce}" src="/js/login.js?d=${Date.now()}"></script>`
            : "";

        res.send(`${localAuthScript}${scripts}<body>${formHtml}</body>`);
    }

    /**
     * Script tags for the external-identity login page, in load order: the broker's SDK, an inline
     * carrier holding the token getter's name and the broker's public browser config, the broker's
     * init script, and finally the glue.
     *
     * Every tag carries the page nonce, which is what permits a CDN URL under `script-src 'self'
     * 'nonce-…'`. They are blocking tags on purpose: `initScript` runs immediately and defines the
     * global the button calls, so it must not race the SDK.
     *
     * The public config is read from `process.env` at render time rather than baked in, so a value
     * rotated in the environment takes effect without regenerating.
     */
    private externalIdentityScripts(nonce: string): string {
        const external = this.externalUI;
        if (!external) return "";

        const config: Record<string, string> = {};
        const missing: string[] = [];
        for (const [key, envName] of Object.entries(external.envKeys)) {
            const value = process.env[envName];
            if (value) config[key] = value;
            else missing.push(envName);
        }
        const problems = [...diagnoseMissingEnv(missing, this.envFileValues()),
            ...this.sdkProblems(external),
            ...this.checkConfig(external, config)];
        this.warnIfUnconfigured(problems);

        const sdkScripts = external.sdkScripts
            .map((src) => `<script nonce="${nonce}" src="${this.escapeHtml(src)}"></script>`)
            .join("\n                ");

        // `problems` travels to the browser so a failed sign-in can say what is actually wrong: the
        // broker's own errors for a misconfigured client are generic by design.
        const carrier = JSON.stringify({
            getToken: external.getToken,
            resumeRedirect: external.resumeRedirect,
            signInMethod: external.signInMethod,
            config,
            problems,
        }).replace(/</g, "\\u003c");

        // The init script is preset-authored, not user input, but it is still interpolated into an
        // inline <script>: break any literal closing tag so a comment in it cannot end the block early.
        const initScript = external.initScript.replace(/<\/script/gi, "<\\/script");

        return `
                ${sdkScripts}
                <script nonce="${nonce}">window.__vexExternalLogin = ${carrier};</script>
                <script nonce="${nonce}">${initScript}</script>
                <script nonce="${nonce}" src="/js/externallogin.js"></script>`;
    }

    /**
     * The env file's own values, read once.
     *
     * Only used to tell a shadowed variable from an unset one; nothing here changes what the app reads.
     * A missing or unparseable file is not an error — plenty of deployments have no `.env` at all.
     */
    private envFileValues(): Record<string, string> {
        if (LoginUI.envFileCache) return LoginUI.envFileCache;

        let values: Record<string, string> = {};
        try {
            values = dotenv.parse(fs.readFileSync(path.join(process.cwd(), ".env")));
        }
        catch {
            // no .env, or unreadable: every missing name is then simply unset
        }

        LoginUI.envFileCache = values;
        return values;
    }

    /**
     * Apply the preset's declarative config checks.
     *
     * These catch mistakes that are knowable here but surface in the browser as something generic — a
     * Firebase API key/appId from a *mobile* app registration being the motivating example.
     */
    private checkConfig(external: ExternalIdentityUI, config: Record<string, string>): string[] {
        const problems: string[] = [];

        for (const check of external.configChecks ?? []) {
            const value = config[check.key];
            if (value === undefined) continue;   // already reported as missing

            const matched = check.warnIfMatches ? new RegExp(check.warnIfMatches).test(value) : false;
            const unmatched = check.warnUnlessMatches ? !new RegExp(check.warnUnlessMatches).test(value) : false;
            if (matched || unmatched) problems.push(check.message);
        }

        return problems;
    }

    /**
     * Say so on the server when the broker's public config is missing or looks wrong.
     *
     * Without this the only signal is a browser alert from the button — which for a missing value reads
     * as "you forgot to set the variables" even when they *are* set in `.env` (the actual cause is
     * usually that the process started before they were, and `.env` is read once at startup), and for a
     * wrong value is something generic from the broker.
     *
     * Logged once per distinct set of problems, not per request: this runs on a page render.
     */
    private warnIfUnconfigured(problems: string[]): void {
        if (problems.length === 0) return;

        const signature = problems.join("|");
        if (LoginUI.warnedEnvSignature === signature) return;
        LoginUI.warnedEnvSignature = signature;

        console.warn(
            `[vex] external identity is enabled but its public browser config is not usable:\n  - ` +
            problems.join("\n  - ") +
            "\nIf a value is already in .env, restart the server — .env is read once at startup."
        );
    }

    private logoutPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
        res.send(`
            <script nonce="${nonce}">
                localStorage.removeItem('accessToken');
                localStorage.removeItem('accessTokenIndex');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('refreshTokenIndex');
            </script>
        `);
    }

    private myTokensPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
        res.send(`
            <script nonce="${nonce}" src="/js/mytokens.js"></script>
            <link rel="stylesheet" href="/css/style.css">
            <body>
                <h1>My Token</h1>
                <pre id="tokenData"></pre>
                <a href="/">back to home</a>
            </body>
        `);
    }

    private refreshTokenPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
        res.send(`
            <script nonce="${nonce}" src="/js/refreshtokens.js"></script>
            <link rel="stylesheet" href="/css/style.css">
            <body>
                <h1>New Token</h1>
                <pre id="tokenData"></pre>
                <a href="/">back to home</a>
            </body>
        `);
    }

    private loginCallbackPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
        res.send(`
            <script nonce="${nonce}" src="/js/logincallback.js"></script>
            <link rel="stylesheet" href="/css/style.css">
            <body>
                <h1>Profile Data</h1>
                <pre id="tokenData"></pre>
                <a href="/">back to home</a>
            </body>
        `);
    }

    /**
     * Self-service account deletion.
     *
     * The copy is deliberately explicit about what survives: this is a tombstone, not an erasure of
     * everything. Claiming otherwise would contradict both the implementation and the store listing.
     *
     * The sign-in prerequisite is stated in the page rather than left to the script, because the
     * server picks the account from the verified token only: with no token there is nothing to
     * delete, and a visitor arriving here directly would otherwise get a bare `401`. This page is
     * regenerated on every run, so the guidance reaches existing projects; `deleteaccount.js` is not
     * overwritten, which is why the check is not the only line of defence.
     */
    private deleteAccountPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
        const signInHint = this.authEnabled
            ? `<strong>You must be signed in.</strong> Deletion is self-service and the server takes the
                    account from your access token, so <a href="/login">sign in first</a> if you are not.`
            : "<strong>You must be signed in.</strong> Deletion is self-service and the server takes the account from your access token.";
        res.send(`
            <link rel="stylesheet" href="/css/style.css">
            <body>
                <h1>Delete account</h1>
                <p><strong>This cannot be undone.</strong></p>
                <p>
                    You will need to create a new account to use the service again; the same
                    sign-in provider will not restore this one.
                </p>
                <p id="signInRequired">${signInHint}</p>
                <p>Type <code>DELETE</code> to confirm:</p>
                <input type="text" id="confirmInput" autocomplete="off"/>
                <br/><br/>
                <button id="deleteAccountBtn">Delete my account</button>
                <br/><br/>
                <pre id="deleteResult"></pre>
                <a href="/">back to home</a>
            </body>
            <script nonce="${nonce}" src="/js/deleteaccount.js"></script>
        `);
    }
}
