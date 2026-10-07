import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `LoginUI` renders the generated app's own login page. Its output is HTML that depends on config
 * combinations — precisely the shape that regresses silently (a button bound to nothing, or a nonce
 * that no longer matches its CSP header, looks fine in a diff).
 *
 * Two modules are stubbed:
 *
 * - `express` belongs to the *generated app*, not to this repo, so `Router` is replaced by the minimal
 *   surface `LoginUI` uses. Routing is therefore not under test here; the HTML is. Real express
 *   integration is covered by the e2e suite, which boots a generated app.
 * - `FirebaseAuthUI.gen` is overwritten by the generator in a real app; the copy in the template
 *   directory is the stand-in this repo compiles against, and its setter lets a test choose what the
 *   generator "emitted", so the default and the app-override paths are both exercised.
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

import LoginUI, { FirebaseAuthUI, LoginUIConfig } from "../../src/templates/_routes/LoginUI";
import { setFirebaseAuthUI } from "../../src/templates/_routes/FirebaseAuthUI.gen";

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

const firebaseUI: FirebaseAuthUI = {
    label: "Sign in with {provider}",
    sdkBaseUrl: "https://www.gstatic.com/firebasejs/12.19.0/",
    providers: [
        { id: "google", label: "Google" },
        { id: "github", label: "GitHub" },
    ],
    defaultProviders: ["google"],
    providersEnvKey: "TEST_FIREBASE_PROVIDERS",
    envKeys: { apiKey: "TEST_FIREBASE_API_KEY", projectId: "TEST_FIREBASE_PROJECT", authDomain: "TEST_FIREBASE_AUTH_DOMAIN" },
    csp: {
        scriptSrc: ["https://www.gstatic.com"],
        connectSrc: ["https://identitytoolkit.googleapis.com"],
        frameSrc: ["https://accounts.google.com"],
    },
};

const baseConfig: LoginUIConfig = { localAuth: false, oauthProviders: [] };

afterEach(() => {
    setFirebaseAuthUI(undefined);
    delete process.env.TEST_FIREBASE_API_KEY;
    delete process.env.TEST_FIREBASE_PROJECT;
    delete process.env.TEST_FIREBASE_AUTH_DOMAIN;
    delete process.env.TEST_FIREBASE_PROVIDERS;
});

describe("LoginUI — login page, Firebase wiring", () => {
    it("renders one button per configured provider, with the label substituted", () => {
        setFirebaseAuthUI(firebaseUI);
        process.env.TEST_FIREBASE_PROVIDERS = "google,github";

        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain('class="firebaseLoginBtn" data-provider="google"');
        expect(html).toContain('class="firebaseLoginBtn" data-provider="github"');
        expect(html).toContain(">Sign in with Google<");
        expect(html).not.toContain("{provider}");   // template variable is resolved
    });

    it("falls back to the declared default when the env list is unset", () => {
        setFirebaseAuthUI(firebaseUI);

        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain('data-provider="google"');
        expect(html).not.toContain('data-provider="github"');
    });

    it("renders no button for a provider name the wiring cannot start, and says so", () => {
        setFirebaseAuthUI(firebaseUI);
        process.env.TEST_FIREBASE_PROVIDERS = "google,twitter";

        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain('data-provider="google"');
        expect(html).not.toContain('data-provider="twitter"');
        expect(html).toContain("TEST_FIREBASE_PROVIDERS names");
    });

    it("inlines the carrier and the glue, and tags no SDK script of its own", () => {
        setFirebaseAuthUI(firebaseUI);

        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain("window.__vexFirebaseLogin =");
        // the glue ships inside the page, so the two can never be different generations
        expect(html).toContain("signInWithPopup");
        expect(html).toContain('fetch("/api/auth/firebase"');
        // the modules are imported by the glue from sdkBaseUrl, so the page tags no SDK script
        expect(html).not.toContain('src="/js/firebaseauth.js"');
        expect(html).not.toContain('src="/js/firebase/');
    });

    it("keeps the inlined glue safe to interpolate, and renderable as HTML", () => {
        setFirebaseAuthUI(firebaseUI);

        const { html } = renderPage(baseConfig, "/login");

        // A stray backtick or ${ in the glue ends the generator's own template literal, not the page.
        const glueStart = html.indexOf("window.__vexFirebaseLogin =") + 1;
        const glue = html.slice(glueStart);
        expect(glue).not.toContain("`");
        expect(glue).not.toContain("${");
        // a literal closing tag inside the inlined block would end it early: exactly two blocks close
        expect(glue.match(/<\/script>/g)?.length).toBe(2);   // carrier + glue
    });

    it("carries the SDK base URL and the env-derived public config to the glue", () => {
        setFirebaseAuthUI(firebaseUI);
        process.env.TEST_FIREBASE_API_KEY = "key-123";
        process.env.TEST_FIREBASE_PROJECT = "proj-9";

        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain('"sdkBaseUrl":"https://www.gstatic.com/firebasejs/12.19.0/"');
        expect(html).toContain('"apiKey":"key-123"');
        expect(html).toContain('"projectId":"proj-9"');
    });

    it("reports a missing variable, naming it in the message the browser shows", () => {
        setFirebaseAuthUI(firebaseUI);
        process.env.TEST_FIREBASE_PROJECT = "proj-9";

        const { html } = renderPage(baseConfig, "/login");

        expect(html).toContain("not set in .env or process.env: TEST_FIREBASE_API_KEY");
    });

    it("allows gstatic, the token endpoints and the auth window, and keeps the page's own nonce", () => {
        setFirebaseAuthUI(firebaseUI);
        process.env.TEST_FIREBASE_AUTH_DOMAIN = "proj.firebaseapp.com";

        const csp = renderPage(baseConfig, "/login").headers["Content-Security-Policy"];

        expect(csp).toContain("https://www.gstatic.com");
        expect(csp).toContain("connect-src 'self' https://identitytoolkit.googleapis.com");
        // the project's auth domain is added from the environment, so the popup can be framed
        expect(csp).toContain("frame-src https://accounts.google.com https://proj.firebaseapp.com");
        expect(csp).toMatch(/'nonce-[^']+'/);
    });

    it("keeps window.opener alive for the popup, overriding helmet's default", () => {
        setFirebaseAuthUI(firebaseUI);

        const { headers } = renderPage(baseConfig, "/login");

        // helmet sets same-origin app-wide, which nulls window.opener inside the popup — the channel
        // the Firebase handler reports on — and the SDK then reports auth/popup-closed-by-user.
        expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
    });

    it("leaves the opener policy alone when there is no popup to open", () => {
        const { headers } = renderPage(baseConfig, "/login");

        expect(headers["Cross-Origin-Opener-Policy"]).toBeUndefined();
    });

    it("escapes a label, so configuration cannot inject markup into the page", () => {
        setFirebaseAuthUI({ ...firebaseUI, label: '<img src=x onerror="alert(1)"> {provider}' });

        const { html } = renderPage(baseConfig, "/login");

        expect(html).not.toContain("<img src=x");
        expect(html).toContain("&lt;img");
    });

    it("is an app override away from off: no wiring, no Firebase markup", () => {
        const { html } = renderPage(baseConfig, "/login");

        expect(html).not.toContain("firebaseLoginBtn");
        expect(html).not.toContain("firebaseauth.js");
        expect(html).toContain("No OAuth provider configured.");
    });

    it("leaves the passport links alone when both doors are configured", () => {
        setFirebaseAuthUI(firebaseUI);

        const { html } = renderPage({ localAuth: false, oauthProviders: ["google"] }, "/login");

        expect(html).toContain('<a href="/api/auth/google">google</a>');
        expect(html).toContain('class="firebaseLoginBtn"');
    });

    it("shows the login link on the home page for a Firebase-only app", () => {
        setFirebaseAuthUI(firebaseUI);

        const { html } = renderPage(baseConfig, "/");

        expect(html).toContain('<a href="/login">Login</a>');
    });
});

describe("LoginUI — no vendored SDK route any more", () => {
    it("registers only page routes, because the SDK is loaded from gstatic by the glue", () => {
        setFirebaseAuthUI(firebaseUI);

        const ui = new LoginUI(baseConfig);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stack = (ui.getRouter() as any).stack as any[];
        const paths = stack.map((entry) => entry.route?.path);

        expect(paths).toContain("/login");
        expect(paths.some((path: string) => typeof path === "string" && path.startsWith("/js/"))).toBe(false);
    });
});
