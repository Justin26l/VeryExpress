import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `LoginUI` renders the generated app's own login / delete pages. Its output is HTML that depends on
 * config combinations — precisely the shape that regresses silently (a button bound to nothing, or a
 * nonce that no longer matches its CSP header, looks fine in a diff).
 *
 * Two modules are stubbed:
 *
 * - `express` is a dependency of the *generated app*, not of this repo, so `Router` is replaced by the
 *   minimal surface `LoginUI` uses. Routing is therefore not under test here; the HTML is. Real express
 *   integration is covered by the e2e suite, which boots a generated app and fetches these routes.
 * - `ExternalIdentityUI.gen` is overwritten by the generator in a real app; the copy in the template
 *   directory is the stand-in this repo compiles against, and its setter lets a test choose what the
 *   generator "emitted" so both the default and the app-override paths are exercised.
 */
vi.mock("express", () => {
    class StubRouter {
        stack: unknown[] = [];
        get(path: string, handler: unknown) {
            this.stack.push({ route: { path, stack: [{ handle: handler }] } });
        }
    }
    return { Router: () => new StubRouter() };
});

import LoginUI, {
    diagnoseMissingEnv,
    ExternalIdentityUI,
    LoginUIConfig,
} from "../../src/templates/_routes/LoginUI";
import { setExternalIdentityUI } from "../../src/templates/_routes/ExternalIdentityUI.gen";

interface Page {
    html: string;
    headers: Record<string, string>;
    status: number;
}

function renderPage(
    config: LoginUIConfig,
    routePath: string,
    params: Record<string, string> = {},
): Page {
    const ui = new LoginUI(config);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stack = (ui.getRouter() as any).stack as any[];

    const layer = stack.find((entry) => entry.route?.path === routePath);
    if (!layer) throw new Error(`no route registered for "${routePath}"`);

    const handlers = layer.route.stack;
    const handle = handlers[handlers.length - 1].handle;

    let html = "";
    let status = 200;
    const headers: Record<string, string> = {};
    const res = {
        setHeader: (key: string, value: string) => { headers[key] = value; },
        status: (code: number) => { status = code; return res; },
        send: (body: string) => { html = body; },
    };
    handle({ params, query: {} }, res);

    return { html, headers, status };
}

const externalUI: ExternalIdentityUI = {
    label: "Sign in with {provider}",
    sdkScripts: ["/js/firebase/firebase-app-compat.js"],
    sdkFromPackage: {
        route: "/js/firebase",
        package: "firebase",
        files: ["firebase-app-compat.js"],
    },
    getToken: "getBrokerToken",
    resumeRedirect: "getBrokerTokenOnReturn",
    signInMethod: "popup",
    providers: [
        { id: "google", label: "Google" },
        { id: "github", label: "GitHub" },
    ],
    envKeys: { apiKey: "TEST_BROKER_API_KEY", projectId: "TEST_BROKER_PROJECT" },
    initScript: "window.getBrokerToken = function () { return Promise.resolve(\"token\"); };",
};

const baseConfig: LoginUIConfig = { localAuth: false, oauthProviders: [] };

afterEach(() => {
    setExternalIdentityUI(undefined);
    delete process.env.TEST_BROKER_API_KEY;
    delete process.env.TEST_BROKER_PROJECT;
});

describe("LoginUI — login page, generated external identity", () => {
    it("renders a button per configured provider, with the label substituted", () => {
        setExternalIdentityUI(externalUI);
        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain('class="externalLoginBtn" data-provider="google"');
        expect(html).toContain('class="externalLoginBtn" data-provider="github"');
        expect(html).toContain(">Sign in with Google<");
        expect(html).toContain(">Sign in with GitHub<");
        expect(html).not.toContain("{provider}");   // template variable is resolved
    });

    it("loads the broker SDK, the init script and the glue", () => {
        setExternalIdentityUI(externalUI);
        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain('src="/js/firebase/firebase-app-compat.js"');
        expect(html).toContain("window.getBrokerToken = function");
        expect(html).toContain('src="/js/externallogin.js"');
    });

    it("carries the token getter name and the env-derived public config", () => {
        setExternalIdentityUI(externalUI);
        process.env.TEST_BROKER_API_KEY = "key-123";
        process.env.TEST_BROKER_PROJECT = "proj-9";

        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain("window.__vexExternalLogin =");
        expect(html).toContain('"getToken":"getBrokerToken"');
        expect(html).toContain('"apiKey":"key-123"');
        expect(html).toContain('"projectId":"proj-9"');
    });

    it("omits config keys whose env var is unset", () => {
        setExternalIdentityUI(externalUI);
        const { html } = renderPage(baseConfig, "/login");

        expect(html).not.toContain('"apiKey"');
    });

    /**
     * Redirect mode has to be expressible to the browser: the mode itself (the SDK chooses popup vs
     * redirect) and the global that completes the sign-in on return.
     */
    it("passes the sign-in mode and the resume global to the page", () => {
        setExternalIdentityUI({ ...externalUI, signInMethod: "redirect" });
        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain('"signInMethod":"redirect"');
        expect(html).toContain('"resumeRedirect":"getBrokerTokenOnReturn"');
    });

    /**
     * The page sets `script-src 'self' 'nonce-…'`, which is what permits a third-party SDK URL — but
     * only if every script tag carries that same nonce. A mismatch renders a blank-looking page whose
     * scripts were all blocked.
     */
    it("gives every script tag the nonce the CSP header declares", () => {
        setExternalIdentityUI(externalUI);
        const { html, headers } = renderPage({ ...baseConfig, localAuth: true }, "/login");

        const nonce = /'nonce-([^']+)'/.exec(headers["Content-Security-Policy"])?.[1];
        expect(nonce).toBeTruthy();

        const declared = [...html.matchAll(/<script[^>]*\snonce="([^"]*)"/g)].map((m) => m[1]);
        // login.js + sdk + carrier + init + glue
        expect(declared.length).toBe(5);
        for (const value of declared) expect(value).toBe(nonce);

        // every script must be nonce'd, including the SDK, or it never loads
        expect(html).toContain(`nonce="${nonce}" src="/js/firebase/firebase-app-compat.js"`);
    });

    /**
     * The only signal used to be a browser alert from the button, which reads as "you forgot to set the
     * variables" even when they *are* in `.env` and the process simply started before they were. A
     * server-side line naming them is what makes that diagnosis immediate.
     */
    it("warns on the server, naming the missing public config variables", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => { });
        setExternalIdentityUI(externalUI);

        // A different missing set from the other cases, so the once-per-signature dedupe cannot swallow
        // this assertion regardless of test order.
        process.env.TEST_BROKER_API_KEY = "set";

        renderPage(baseConfig, "/login");

        const messages = warn.mock.calls.map((call) => String(call[0]));
        expect(messages.some((msg) => msg.includes("TEST_BROKER_PROJECT"))).toBe(true);
        expect(messages.some((msg) => msg.includes("restart"))).toBe(true);

        warn.mockRestore();
    });

    /**
     * A broker reports a misconfigured client with something generic (Firebase's
     * `auth/internal-error`), so a knowable mistake has to be named. The check is declarative data on
     * the preset, which keeps `LoginUI` vendor-neutral.
     */
    it("applies the preset's config checks, in the log and in the page", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => { });
        process.env.TEST_BROKER_API_KEY = "MOBILE-key";
        process.env.TEST_BROKER_PROJECT = "proj";

        setExternalIdentityUI({
            ...externalUI,
            configChecks: [{ key: "apiKey", warnIfMatches: "MOBILE", message: "the key looks mobile-only" }],
        });

        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain("the key looks mobile-only");
        expect(html).toContain('"problems":');
        expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("the key looks mobile-only");

        warn.mockRestore();
    });

    it("says nothing when every config check passes", () => {
        process.env.TEST_BROKER_API_KEY = "WEB-key";
        process.env.TEST_BROKER_PROJECT = "proj";

        setExternalIdentityUI({
            ...externalUI,
            // no vendored SDK in this case, so the only possible problem would be a config check
            sdkFromPackage: undefined,
            configChecks: [{ key: "apiKey", warnIfMatches: "MOBILE", message: "the key looks mobile-only" }],
        });

        const { html } = renderPage(baseConfig, "/login");

        expect(html).not.toContain("the key looks mobile-only");
        expect(html).toContain('"problems":[]');
    });

    /**
     * Regression guard for a real failure: Firebase Auth injects `apis.google.com/js/api.js` at sign-in
     * time to sync the popup, and an injected tag carries no nonce — so under `script-src 'self'
     * 'nonce-…'` the browser blocks it and the only symptom is a generic auth error.
     */
    it("allows the CSP hosts the broker's SDK injects at runtime", () => {
        setExternalIdentityUI({ ...externalUI, csp: { scriptSrc: ["https://apis.google.com"] } });

        const { headers } = renderPage(baseConfig, "/login");
        const csp = headers["Content-Security-Policy"];

        expect(csp).toContain("script-src 'self'");
        expect(csp).toContain("'nonce-");
        expect(csp).toContain("https://apis.google.com");
    });

    it("keeps the login policy host-restricted when the preset declares nothing", () => {
        setExternalIdentityUI(externalUI);

        const { headers } = renderPage(baseConfig, "/login");

        expect(headers["Content-Security-Policy"]).not.toContain("apis.google.com");
    });

    it("escapes a label that tries to inject markup", () => {
        setExternalIdentityUI({ ...externalUI, label: '<img src=x onerror="alert(1)"> {provider}' });
        const { html } = renderPage(baseConfig, "/login");

        expect(html).not.toContain("<img src=x");
        expect(html).toContain("&lt;img src=x");
    });

    /**
     * The init script is preset-authored rather than user input, but it is still interpolated into an
     * inline `<script>`: a literal closing tag inside it would end the block early and dump the rest of
     * the script into the page as text.
     */
    it("cannot be broken out of by a closing script tag in the init script", () => {
        setExternalIdentityUI({ ...externalUI, initScript: "// </script><script>alert(1)</script>" });
        const { html } = renderPage(baseConfig, "/login");

        expect(html).not.toContain("</script><script>alert(1)");
        expect(html).toContain("<\\/script>");
    });

    it("still renders passport providers as redirect links", () => {
        setExternalIdentityUI(externalUI);
        const { html } = renderPage({ ...baseConfig, oauthProviders: ["google"] }, "/login");

        expect(html).toContain('href="/api/auth/google"');
        expect(html).toContain('data-provider="google"');
    });

    it("renders no broker button when neither the generator nor the app supplies one", () => {
        const { html } = renderPage(baseConfig, "/login");

        expect(html).not.toContain("externalLoginBtn");
        expect(html).not.toContain("externallogin.js");
        expect(html).toContain("No OAuth provider configured.");
    });

    it("lets the app override the generated wiring", () => {
        setExternalIdentityUI(externalUI);
        const { html } = renderPage({
            ...baseConfig,
            externalIdentity: { ...externalUI, label: "Custom {provider}", providers: [{ id: "apple", label: "Apple" }] },
        }, "/login");

        expect(html).toContain('data-provider="apple"');
        expect(html).toContain(">Custom Apple<");
        expect(html).not.toContain('data-provider="google"');
    });
});

describe("LoginUI — home page", () => {
    /**
     * Regression guard: the login link used to require `localAuth || oauthProviders.length > 0`, so a
     * broker-only app — which is exactly what `externalIdentity` is for — showed no way to sign in at
     * all. Same class of gap as `isAuthEnabled` treating such a project as auth-less.
     */
    it("shows the login link for a broker-only app", () => {
        setExternalIdentityUI(externalUI);
        const { html } = renderPage(baseConfig, "/");

        expect(html).toContain('href="/login"');
    });

    it("hides the login link when no sign-in path exists", () => {
        const { html } = renderPage(baseConfig, "/");

        expect(html).not.toContain('href="/login"');
    });

    it("hides the delete link when deletion is disabled", () => {
        expect(renderPage({ ...baseConfig, deleteAccount: false }, "/").html)
            .not.toContain('href="/delete_account"');
    });
});

describe("LoginUI — delete account page", () => {
    /**
     * Deletion needs a token, and a visitor arriving here directly used to get nothing but a bare 401
     * from the script. This page is regenerated on every run, unlike the script, so stating the
     * prerequisite here is what reaches existing projects.
     */
    it("states the sign-in prerequisite and links to the login page", () => {
        const { html } = renderPage({ ...baseConfig, localAuth: true }, "/delete_account");

        expect(html).toContain("You must be signed in");
        expect(html).toContain('href="/login"');
    });

    it("states the prerequisite even when there is no sign-in path to link to", () => {
        const { html } = renderPage(baseConfig, "/delete_account");

        expect(html).toContain("You must be signed in");
        expect(html).not.toContain('href="/login"');
    });

    it("is not registered at all when deletion is disabled", () => {
        const ui = new LoginUI({ ...baseConfig, deleteAccount: false });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paths = ((ui.getRouter() as any).stack as any[]).map((l) => l.route?.path);

        expect(paths).not.toContain("/delete_account");
    });
});

/**
 * Two situations produce the same symptom — the broker says it is unconfigured — and they have different
 * fixes, so the diagnosis has to tell them apart. This is the case that cost a debugging round: the
 * values *were* in `.env`, the process simply did not have them.
 */
describe("diagnoseMissingEnv", () => {
    it("separates a shadowed variable from an unset one", () => {
        const problems = diagnoseMissingEnv(
            ["FIREBASE_API_KEY", "FIREBASE_PROJECT_ID"],
            { FIREBASE_API_KEY: "in-the-file" },
        );

        const shadowed = problems.find((p) => p.includes("set in .env but NOT in process.env"));
        expect(shadowed).toContain("FIREBASE_API_KEY");
        expect(shadowed).not.toContain("FIREBASE_PROJECT_ID");
        // the fix for this branch is unsetting the ambient variable, not editing .env again
        expect(shadowed).toContain("override");
        expect(shadowed).toContain("env | grep");

        const unset = problems.find((p) => p.includes("not set in .env or process.env"));
        expect(unset).toContain("FIREBASE_PROJECT_ID");
    });

    it("reports only the unset branch when the file has nothing", () => {
        const problems = diagnoseMissingEnv(["FIREBASE_API_KEY"], {});

        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain("not set in .env or process.env");
    });

    it("says nothing when nothing is missing", () => {
        expect(diagnoseMissingEnv([], {})).toEqual([]);
    });
});

/**
 * The broker SDK is served from the installed npm package, so the route reads `node_modules` at request
 * time. `files` has to behave as an allowlist rather than as a hint: without that, a request could name
 * any file in the package — or climb out of it.
 */
describe("LoginUI — broker SDK route", () => {
    const sdkConfig = { ...baseConfig, externalIdentity: externalUI };
    const requestSdk = (file: string) => renderPage(sdkConfig, "/js/firebase/:file", { file });

    it("registers the route only when the SDK is vendored from a package", () => {
        const ui = new LoginUI({
            ...baseConfig,
            externalIdentity: { ...externalUI, sdkFromPackage: undefined },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paths = ((ui.getRouter() as any).stack as any[]).map((l) => l.route?.path);

        expect(paths).not.toContain("/js/firebase/:file");
    });

    it("refuses a file that is not on the allowlist", () => {
        const page = requestSdk("../../package.json");

        expect(page.status).toBe(404);
        expect(page.html).toContain("Unknown broker SDK file");
    });

    it("reports a missing install rather than serving an empty script", () => {
        // the fixture's package is not installed in this repo
        const page = requestSdk("firebase-app-compat.js");

        expect(page.status).toBe(500);
        expect(page.html).toContain("npm install");
    });
});
