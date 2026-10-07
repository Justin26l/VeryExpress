// {{headerComment}}
import { Router, Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

import { firebaseAuthUI } from "./FirebaseAuthUI.gen";

/**
 * Explain config values that `process.env` does not have.
 *
 * Two different situations produce the same symptom — Firebase reports itself unconfigured — and they
 * need different fixes, so they are separated here:
 *
 * - **present in `.env` but absent from `process.env`**: `dotenv` does not override a variable that is
 *   already set in the environment, and it only runs once at startup. Either the process started before
 *   the file was edited, or the name is exported by the shell / IDE launch config / container with a
 *   different value.
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
    /** Serve the self-service deletion page at `/delete_account`. */
    deleteAccount?: boolean;
    /** Override the Firebase sign-in wiring. */
    firebase?: FirebaseAuthUI;
}

/** Everything the login page needs to drive Firebase, as emitted into `FirebaseAuthUI.gen.ts`. */
export interface FirebaseAuthUI {
    /** Button text template; `{provider}` is replaced by the provider's label. */
    label: string;
    /** gstatic ESM directory for the pinned SDK version, trailing slash included. */
    sdkBaseUrl: string;
    /** Every provider the page can start. */
    providers: { id: string; label: string }[];
    /** Rendered when `providersEnvKey` is unset. */
    defaultProviders: string[];
    /** env var holding the comma-separated list of providers to render buttons for. */
    providersEnvKey: string;
    /** Public config key → env var name. Resolved at render time; missing values stay absent. */
    envKeys: Record<string, string>;
    /** Hosts Firebase's sign-in needs, per directive. */
    csp: {
        scriptSrc: string[];
        connectSrc: string[];
        frameSrc: string[];
    };
}

/** A sign-in method to render a button for. */
interface firebaseProvider {
    id: string;
    label: string;
}

export default class LoginUI {

    /** Last set of problems warned about, so a page render logs them once. */
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
    }

    /**
     * The Firebase wiring in force: an explicit app override, else the generated default.
     *
     * The fallback is why `auth.firebase` needs no `server.ts` edit — `server.ts` is written once and
     * never overwritten, so anything reachable only through it would not apply to an existing project.
     * This file and `FirebaseAuthUI.gen.ts` are both regenerated.
     */
    private get firebaseUI(): FirebaseAuthUI | undefined {
        return this.config.firebase ?? firebaseAuthUI;
    }

    private nonce(): string {
        return crypto.randomBytes(16).toString("base64");
    }

    /** De-duplicate while keeping declaration order; a repeated host adds nothing. */
    private uniqueHosts(hosts: string[]): string[] {
        return hosts.filter((host, index) => hosts.indexOf(host) === index);
    }

    /** The project's auth domain, e.g. `my-project.firebaseapp.com`. Absent when unconfigured. */
    private firebaseAuthDomain(ui: FirebaseAuthUI): string | undefined {
        return process.env[ui.envKeys.authDomain] || undefined;
    }

    /**
     * CSP for the login page: the page's own scripts plus the hosts Firebase's sign-in needs.
     *
     * The hosts are not optional decoration. The SDK is loaded as an ES module from gstatic, it injects
     * `apis.google.com/js/api.js` at sign-in time without a nonce, it calls the token endpoints
     * directly, and the popup it opens frames the project's auth domain — a host missing here fails
     * silently, and the only symptom is a generic authentication error.
     */
    private loginPageCsp(nonce: string): string {
        const ui = this.firebaseUI;
        if (!ui) return `script-src 'self' 'nonce-${nonce}'`;

        const authDomain = this.firebaseAuthDomain(ui);
        const frameSrc = authDomain ? [...ui.csp.frameSrc, `https://${authDomain}`] : ui.csp.frameSrc;

        return [
            `script-src ${this.uniqueHosts(["'self'", `'nonce-${nonce}'`, ...ui.csp.scriptSrc]).join(" ")}`,
            `connect-src ${this.uniqueHosts(["'self'", ...ui.csp.connectSrc]).join(" ")}`,
            `frame-src ${this.uniqueHosts(frameSrc).join(" ")}`,
        ].join("; ");
    }

    /** Escape for HTML text/attribute context. Labels and provider ids come from configuration. */
    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    /**
     * Which providers to render a button for, and what is wrong with the names that were asked for.
     *
     * The list is read from the environment at render time rather than generated, because which Firebase
     * sign-in methods exist is a deployment fact. A name the wiring cannot start is reported instead of
     * producing a button that fails inside the SDK with something generic.
     */
    private firebaseProviderSelection(ui: FirebaseAuthUI): { providers: firebaseProvider[]; problems: string[] } {
        const configured = process.env[ui.providersEnvKey];
        const requested = (configured ? configured.split(",") : ui.defaultProviders)
            .map((name) => name.trim())
            .filter((name) => name.length > 0);

        const providers: firebaseProvider[] = [];
        const problems: string[] = [];

        for (const name of requested) {
            const match = ui.providers.find((provider) => provider.id === name);
            if (match) providers.push(match);
            else {
                problems.push(
                    `${ui.providersEnvKey} names "${name}", which this login page cannot start ` +
                    `(known: ${ui.providers.map((provider) => provider.id).join(", ")})`,
                );
            }
        }

        return { providers, problems };
    }

    /**
     * Auth is on when *any* sign-in path exists. `firebase` counts: an app with `localAuth: false` and
     * no passport provider is not auth-less if Firebase is configured, and leaving it out of this test
     * would hide the login link for exactly that app.
     */
    private get authEnabled(): boolean {
        return this.config.localAuth
            || this.config.oauthProviders.length > 0
            || !!this.firebaseUI;
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

        // helmet sets `Cross-Origin-Opener-Policy: same-origin` app-wide by default, which puts a
        // cross-origin popup in its own browsing context group and nulls `window.opener` inside it. The
        // Firebase sign-in handler runs on the project's auth domain and reports the result back through
        // exactly that channel — and the SDK also watches `popup.closed`, which the policy blocks — so
        // the flow dies at the handshake and the SDK reports `auth/popup-closed-by-user`, seconds after
        // a popup the user never touched, with nothing in the server log to explain it.
        //
        // `same-origin-allow-popups` keeps the relationship for popups this page opens while still
        // isolating every other cross-origin window, so it is only set where there is a popup to open.
        // It has to be set here rather than in the app's helmetConfig: server.ts is a copy-once
        // template, so a change there would never reach a project that already exists.
        if (this.firebaseUI) {
            res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
        }

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

        const firebase = this.firebaseUI;
        const selection = firebase ? this.firebaseProviderSelection(firebase) : undefined;

        formHtml += "                <p>Login with SSO:</p>\n";
        if (this.config.oauthProviders.length === 0 && !firebase) {
            formHtml += "                <p>No OAuth provider configured.</p>\n";
        }
        else {
            // passport providers: server-driven redirect flows
            this.config.oauthProviders.forEach((provider) => {
                formHtml += `                <a href="/api/auth/${provider}">${provider}</a><br/>\n`;
            });

            // Firebase: client-driven. One button per configured sign-in method; the provider id
            // travels to the glue as a data attribute, and on to signIn().
            if (firebase && selection) {
                selection.providers.forEach((provider) => {
                    const text = firebase.label.replace("{provider}", provider.label);
                    formHtml += `                <button class="firebaseLoginBtn" data-provider="${this.escapeHtml(provider.id)}">${this.escapeHtml(text)}</button><br/>\n`;
                });
            }
        }

        const scriptTag = this.config.localAuth
            ? `<script nonce="${nonce}" src="/js/login.js?d=${Date.now()}"></script>`
            : "";
        const firebaseScripts = firebase && selection ? this.firebaseScripts(nonce, selection.problems) : "";

        res.send(`${scriptTag}${firebaseScripts}<body>${formHtml}</body>`);
    }

    /**
     * The inline carrier and the inline glue, in that order.
     *
     * The carrier holds the public config, the SDK base URL and the problems the server could
     * determine; the glue does the sign-in. Both tags carry the page nonce.
     *
     * The glue is **inlined rather than served from `public/js/`** on purpose: `public/**` is a
     * copy-once template, so a project that already had an older glue would keep it while this page
     * moved on — which is exactly how a carrier/glue mismatch shipped once. Inlined, the two are the
     * same generated artifact and cannot diverge.
     *
     * The public config is read from `process.env` at render time rather than baked in, so a value
     * rotated in the environment takes effect without regenerating.
     */
    private firebaseScripts(nonce: string, providerProblems: string[]): string {
        const ui = this.firebaseUI;
        if (!ui) return "";

        const config: Record<string, string> = {};
        const missing: string[] = [];
        for (const [key, envName] of Object.entries(ui.envKeys)) {
            const value = process.env[envName];
            if (value) config[key] = value;
            else missing.push(envName);
        }

        const problems = [
            ...providerProblems,
            ...diagnoseMissingEnv(missing, this.envFileValues()),
        ];
        this.warnIfUnconfigured(problems);

        // `problems` travels to the browser so a failed sign-in can say what is actually wrong: the
        // SDK's own errors for a misconfigured client are generic by design.
        const carrier = JSON.stringify({
            sdkBaseUrl: ui.sdkBaseUrl,
            config,
            problems,
        }).replace(/</g, "\\u003c");

        // Generator-authored, not user input, but still interpolated into an inline <script>: break
        // any literal closing tag so a comment in it cannot end the block early.
        const glue = firebaseGlueScript.replace(/<\/script/gi, "<\\/script");

        return `
                <script nonce="${nonce}">window.__vexFirebaseLogin = ${carrier};</script>
                <script nonce="${nonce}">${glue}</script>`;
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
     * Say so on the server when Firebase's public config is missing or looks wrong.
     *
     * Without this the only signal is a browser alert from the button — which for a missing value reads
     * as "you forgot to set the variables" even when they *are* set in `.env` (the actual cause is
     * usually that the process started before they were, and `.env` is read once at startup), and for a
     * wrong value is something generic from Firebase.
     *
     * Logged once per distinct set of problems, not per request: this runs on a page render.
     */
    private warnIfUnconfigured(problems: string[]): void {
        if (problems.length === 0) return;

        const signature = problems.join("|");
        if (LoginUI.warnedEnvSignature === signature) return;
        LoginUI.warnedEnvSignature = signature;

        console.warn(
            `[vex] auth.firebase is enabled but its public browser config is not usable:\n  - ` +
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
     */
    private deleteAccountPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
        res.send(`
            <link rel="stylesheet" href="/css/style.css">
            <body>
                <h1>Delete account</h1>
                <p><strong>This cannot be undone.</strong></p>
                <p>
                    You will need to create a new account to use the service again; the same
                    sign-in provider will not restore this one.
                </p>
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

/**
 * The browser half: start a Firebase sign-in for a provider id and hand the ID token to
 * `POST /api/auth/firebase`.
 *
 * Inlined into the login page rather than shipped as a `public/js/` file, so the page and its glue are
 * one generated artifact. Kept free of backticks and `${`, because it is interpolated into the
 * template literal above — a stray one breaks the build, not just the page (there is a test).
 *
 * It uses the **modular** SDK, the same API the app's own web sign-in uses: ES modules from gstatic at
 * a pinned version, `getAuth` / `signInWithPopup` / `GoogleAuthProvider`, then `user.getIdToken()`.
 * The modules are preloaded on page load on purpose — importing them inside the click handler opens
 * the popup after a network wait, which Chrome treats as a non-user-initiated popup and blocks.
 */
const firebaseGlueScript = `
document.addEventListener("DOMContentLoaded", function () {
    var settings = window.__vexFirebaseLogin || {};
    var config = settings.config || {};
    var base = settings.sdkBaseUrl;
    var problems = settings.problems || [];

    var buttons = document.querySelectorAll ? document.querySelectorAll(".firebaseLoginBtn") : [];

    /**
     * Firebase reports a misconfigured client with something generic - auth/internal-error says
     * nothing about the cause. The login page sends along what the server could determine, so a
     * developer is not left reading a network trace.
     */
    function describe(err) {
        var code = err && err.code ? err.code : "(no code)";
        var hints = {
            "auth/unauthorized-domain":
                "add this origin under Authentication > Settings > Authorized domains",
            "auth/operation-not-allowed":
                "enable this provider under Authentication > Sign-in method",
            "auth/popup-blocked":
                "the browser blocked the popup; allow popups for this origin",
            "auth/popup-closed-by-user":
                "the popup closed before sign-in finished. If you did not close it, the handshake " +
                "between the popup and this page failed: third-party cookies are blocked (Chrome's " +
                "default now), an extension or ad-blocker is interfering, or the popup never reached " +
                "the provider. Open DevTools on the popup window and read the URL it is stuck on - " +
                "that distinguishes all three. A private window with extensions disabled is the " +
                "quickest way to tell an environment cause from a configuration one.",
            "auth/cancelled-popup-request":
                "another popup request was already in flight",
            "auth/network-request-failed":
                "the browser could not reach Firebase. Check whether the request failed with " +
                "net::ERR_BLOCKED_BY_CLIENT - that means an extension blocked it, not the network",
            "auth/internal-error":
                "Firebase returned a generic error. Usual causes: (1) the API key is restricted - in " +
                "Google Cloud console > APIs & Services > Credentials, the key this Web app uses must " +
                "allow this origin under HTTP referrers; (2) an ad-blocker or privacy extension is " +
                "blocking firebaseapp.com / apis.google.com; (3) the auth domain is wrong, so the " +
                "popup lands somewhere that is not the sign-in handler. Check the browser Network tab " +
                "for a failing identitytoolkit.googleapis.com request - its response body holds the " +
                "real reason. A request failing with net::ERR_BLOCKED_BY_CLIENT was never sent: an " +
                "extension blocked it, which is why the same flow often works in a private window."
        };
        var hint = hints[code];
        return code + (hint ? " - " + hint : "") + (err && err.message ? " [" + err.message + "]" : "");
    }

    function report(message) {
        if (problems.length > 0) {
            message += "\\n\\nServer-side configuration problems:\\n- " + problems.join("\\n- ");
        }

        // alert rather than a DOM node: the login page has no result container.
        alert(message);
    }

    /** The SDK modules, preloaded on page load. See the note on firebaseGlueScript. */
    var sdk = null;
    var preload = null;

    function loadSdk() {
        if (!preload) {
            preload = Promise.all([
                import(base + "firebase-app.js"),
                import(base + "firebase-auth.js"),
            ]).then(function (loaded) {
                sdk = { app: loaded[0], auth: loaded[1] };
                return sdk;
            }).catch(function (err) {
                preload = null;   // let the next attempt retry the download
                throw err;
            });
        }
        return preload;
    }

    function providerFor(auth, providerId) {
        switch (providerId) {
        case "google": return new auth.GoogleAuthProvider();
        case "github": return new auth.GithubAuthProvider();
        case "apple": return new auth.OAuthProvider("apple.com");
        case "microsoft": return new auth.OAuthProvider("microsoft.com");
        default: throw new Error("unsupported provider: " + providerId);
        }
    }

    function appFor(app) {
        return app.getApps().length ? app.getApps()[0] : app.initializeApp(config);
    }

    /** Open the provider's popup and resolve with a fresh Firebase ID token. */
    function signIn(providerId) {
        return loadSdk().then(function (modules) {
            var provider = providerFor(modules.auth, providerId);
            return modules.auth.signInWithPopup(modules.auth.getAuth(appFor(modules.app)), provider);
        }).then(function (result) {
            return result.user.getIdToken();
        });
    }

    function post(idToken) {
        return fetch("/api/auth/firebase", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: idToken }),
        }).then(function (response) {
            // read as text first: an error response may not be JSON (a proxy or the express error
            // handler can return HTML), and response.json() would then reject and hide the real status
            return response.text().then(function (text) {
                var body;
                try {
                    body = text ? JSON.parse(text) : {};
                }
                catch (e) {
                    body = { raw: text };
                }

                return { ok: response.ok, status: response.status, body: body };
            });
        });
    }

    /** Same four keys logincallback writes, so the rest of the app reads one shape. */
    function storeTokens(result) {
        localStorage.setItem("accessToken", result.accessToken);
        localStorage.setItem("accessTokenIndex", result.accessTokenIndex);
        localStorage.setItem("refreshToken", result.refreshToken);
        localStorage.setItem("refreshTokenIndex", result.refreshTokenIndex);
    }

    function unconfigured() {
        return "Firebase is not configured on the server: set FIREBASE_WEB_API_KEY, " +
            "FIREBASE_WEB_AUTH_DOMAIN and FIREBASE_WEB_PROJECT_ID in .env and restart the server " +
            "(.env is read only at startup). The server log names the missing variables.";
    }

    // Warm the modules so the first click does not pay for the download. A failure here is reported
    // when a button is used, not twice.
    if (base) loadSdk().catch(function () { /* reported on click */ });

    Array.prototype.forEach.call(buttons, function (button) {
        button.addEventListener("click", function () {
            if (!config.apiKey || !config.authDomain || !config.projectId) {
                report(unconfigured());
                return;
            }

            button.disabled = true;

            signIn(button.getAttribute("data-provider"))
                .then(function (idToken) {
                    if (!idToken) throw new Error("sign-in resolved with no ID token");
                    return post(idToken);
                })
                .then(function (outcome) {
                    var result = outcome.body && outcome.body.result;
                    if (outcome.ok && result && result.accessToken) {
                        storeTokens(result);
                        window.location.href = "/mytokens";
                        return;
                    }

                    button.disabled = false;
                    report("Firebase sign-in failed (" + outcome.status + "): " + JSON.stringify(outcome.body));
                })
                .catch(function (err) {
                    button.disabled = false;
                    report("Firebase sign-in error: " + describe(err));
                });
        });
    });
});
`;
