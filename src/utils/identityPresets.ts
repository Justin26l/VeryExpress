import * as types from "~/types/types";

/**
 * Built-in broker settings for `auth.externalIdentity`.
 *
 * Data only: no network access, no SDK, no per-IdP branch anywhere else in the generator. A preset
 * knows two things a project would otherwise have to repeat by hand — how to verify the broker's ID
 * tokens, and how to wire the broker's browser SDK into the generated login page.
 *
 * The vendor-specific browser code lives here as `ui.initScript`, because that is the one place where
 * vendor knowledge is unavoidable: vex cannot know how to call a broker's JS SDK. Everything around it
 * (the button, the nonce'd script tags, the POST to /api/auth/external) is generic.
 *
 * v1 ships `firebase` only. Cognito, Auth0 and Keycloak are deferred — see
 * docs/plan/vex-external-identity.md §4.4 for what each would have to declare, and which of them can
 * expose an upstream subject at all.
 */

export interface externalIdentityPreset {
    /** Namespace label written when the resolved identity layer is `broker`. */
    brokerLabel: string;
    /** Issuer pattern; `{var}` is substituted from the preset's variables. */
    issuerPattern: string;
    /** Resolve the JWKS URL from the issuer's discovery document at *runtime*. */
    discovery: boolean;
    jwksUrl?: string;
    /** Which variable supplies the expected audience. */
    audienceFrom: "projectId" | "clientId" | "apiIdentifier" | "explicit";
    audienceClaim: string;
    /**
     * Accepted signature algorithms.
     *
     * Asymmetric only. `HS*` is rejected outright: a symmetric algorithm would let a token signed with
     * the *public* key be accepted as an HMAC, which is the classic alg-confusion attack. EdDSA is
     * absent because the generated verifier uses `jsonwebtoken`, which cannot verify it.
     */
    algorithms: string[];
    /** Variables the project must supply. Missing ones fail generation loudly. */
    requires: string[];
    /** `provider` for the upstream layer; null means the capability is absent, not unconfigured. */
    upstreamProvider: { claim: string; map: Record<string, string> } | null;
    /** Where the upstream subject lives; null means unreachable. */
    upstreamSub: { from: string; keyedByProvider: boolean } | null;
    claims: { id: string; email: string; emailVerified: string; username: string[] };
    onMissingEmail: "reject" | "synthesize";
    ui: externalIdentityUI;
}

export interface externalIdentityUI {
    /** Button text, e.g. `Sign in with Google`. `{provider}` is replaced by the provider label. */
    label: string;
    /** Browser SDK scripts loaded on the login page, in order. */
    sdkScripts: string[];
    /**
     * Serve those scripts from an installed npm package instead of a CDN.
     *
     * The version then belongs to npm (`npm update firebase`), the scripts are same-origin — so no CDN
     * host needs a CSP allowance — and the page keeps working offline. `files` doubles as the allowlist
     * for the route that serves them, which is what makes path traversal impossible.
     */
    sdkFromPackage?: {
        /** Same-origin path prefix the scripts are served under. */
        route: string;
        /** Package whose root contains the files. */
        package: string;
        /** File names, relative to the package root. */
        files: string[];
    };
    /**
     * Global the init script defines for starting a sign-in: `signIn(providerId)` resolves to an ID
     * token, or rejects. In `redirect` mode it navigates the page away and never settles — which is
     * why the caller never needs to know which mode is in use.
     */
    getToken: string;
    /**
     * Global the init script defines for *completing* a redirect sign-in: `resume()` resolves to an ID
     * token when this page load is a return from one, else `null`. Called once on page load; a no-op
     * in popup mode.
     */
    resumeRedirect: string;
    /** Which sign-in mode the broker SDK uses. Overridable per project. */
    signInMethod: "popup" | "redirect";
    /** Sign-in methods rendered as buttons. */
    providers: { id: string; label: string }[];
    /**
     * env var names holding the broker's **public** browser configuration. These values are meant to
     * be visible in the browser; the client secret (if the provider has one at all) is not.
     */
    envKeys: Record<string, string>;
    /** Browser JS that initialises the SDK and defines `getToken`. Runs after the SDK scripts. */
    initScript: string;
    /**
     * Extra CSP sources the broker's SDK needs, appended to the login page's policy.
     *
     * A nonce authorises the tags the page renders, but a broker SDK also **injects scripts at
     * runtime** — Firebase Auth loads `apis.google.com/js/api.js` to synchronise the popup — and an
     * injected tag carries no nonce, so `script-src 'self' 'nonce-…'` blocks it outright. Only the
     * origins a SDK genuinely needs belong here; everything else stays host-restricted.
     */
    csp?: {
        /** Hosts added to `script-src` for scripts the SDK injects itself. */
        scriptSrc?: string[];
    };
    /**
     * Sanity checks on the resolved public config, evaluated server-side on each render.
     *
     * A broker whose browser SDK is handed the wrong kind of credential fails with something generic —
     * Firebase's `auth/internal-error` being the canonical example — so the cause is only visible in a
     * network trace. These turn the knowable mistakes into a named warning, both in the server log and
     * in the browser message.
     *
     * Data, not code: the check is a regex on one config value, so `LoginUI` stays vendor-neutral and
     * the vendor knowledge stays in the preset.
     */
    configChecks?: externalIdentityConfigCheck[];
}

export interface externalIdentityConfigCheck {
    /** Config key the check applies to (i.e. a key of `envKeys`). */
    key: string;
    /** Warn when the resolved value matches this regex. */
    warnIfMatches?: string;
    /** Warn when the resolved value does not match this regex. */
    warnUnlessMatches?: string;
    /** What is wrong and what to do about it. Shown to a developer, so be concrete. */
    message: string;
}

/**
 * Firebase.
 *
 * Endpoints below were verified against the live service; see docs/plan/vex-external-identity.md §4.2.
 * Two properties decide its value here:
 *
 * - `firebase.identities["<provider>"][0]` is the *upstream* IdP's subject — the genuine Google `sub`,
 *   the same value `passport-google-oauth20` puts in `profile.id`. Firebase is the only v1 preset with
 *   that capability, which is what makes `identityLayer: "auto"` produce a portable
 *   `("google", <Google sub>)` pair instead of a broker-scoped uid.
 * - The ID token's `sub` is the Firebase uid, and `uid` is only a decode-time alias that firebase-admin
 *   adds; the JWT claim is `sub`.
 */
export const firebase: externalIdentityPreset = {
    brokerLabel: "firebase",
    issuerPattern: "https://securetoken.google.com/{projectId}",
    discovery: true,
    audienceFrom: "projectId",
    audienceClaim: "aud",
    algorithms: ["RS256"],
    requires: ["projectId"],
    upstreamProvider: {
        claim: "firebase.sign_in_provider",
        map: {
            "google.com": "google",
            "github.com": "github",
            "apple.com": "apple",
            "facebook.com": "facebook",
        },
    },
    upstreamSub: { from: "firebase.identities", keyedByProvider: true },
    claims: {
        id: "sub",
        email: "email",
        emailVerified: "email_verified",
        username: ["name", "email", "sub"],
    },
    onMissingEmail: "reject",
    ui: {
        label: "Sign in with {provider}",
        // Same-origin, served from node_modules/firebase by LoginUI: npm owns the version, and no CDN
        // host (or CSP allowance for one) is involved.
        sdkScripts: [
            "/js/firebase/firebase-app-compat.js",
            "/js/firebase/firebase-auth-compat.js",
        ],
        sdkFromPackage: {
            route: "/js/firebase",
            package: "firebase",
            files: ["firebase-app-compat.js", "firebase-auth-compat.js"],
        },
        getToken: "__vexExternalIdentitySignIn",
        resumeRedirect: "__vexExternalIdentityResume",
        signInMethod: "popup",
        providers: [
            { id: "google", label: "Google" },
            { id: "github", label: "GitHub" },
        ],
        envKeys: {
            apiKey: "FIREBASE_API_KEY",
            authDomain: "FIREBASE_AUTH_DOMAIN",
            projectId: "FIREBASE_PROJECT_ID",
            appId: "FIREBASE_APP_ID",
        },
        initScript: `(function () {
    var settings = window.__vexExternalLogin || {};
    var config = settings.config || {};

    /**
     * Firebase reports most client misconfigurations as auth/internal-error, which names no cause. The
     * codes that do carry a meaning are expanded, because the fix is a setting on the Firebase or
     * Google side that a bare code gives no hint about.
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
                "quickest way to tell an environment cause from a configuration one. Setting " +
                "auth.externalIdentity.signInMethod to redirect avoids popups, but it does not avoid " +
                "third-party storage restrictions - it has its own failure mode there.",
            "auth/cancelled-popup-request":
                "another popup request was already in flight",
            "auth/network-request-failed":
                "the browser could not reach Firebase. Check whether the request failed with " +
                "net::ERR_BLOCKED_BY_CLIENT - that means an extension blocked it, not the network",
            "auth/internal-error":
                "Firebase returned a generic error. Usual causes: (1) the API key is restricted - in " +
                "Google Cloud console > APIs & Services > Credentials, the key this Web app uses must " +
                "allow this origin under HTTP referrers; (2) an ad-blocker or privacy extension is " +
                "blocking firebaseapp.com / apis.google.com; (3) third-party cookies are blocked so the " +
                "popup cannot hand state back. Check the browser Network tab for a failing " +
                "identitytoolkit.googleapis.com request - its response body holds the real reason. A " +
                "request failing with net::ERR_BLOCKED_BY_CLIENT was never sent: an extension blocked it, " +
                "which is why the same flow often works in a private window."
        };
        var hint = hints[code];
        return code + (hint ? " - " + hint : "") + (err && err.message ? " [" + err.message + "]" : "");
    }

    function providerFor(providerId) {
        switch (providerId) {
        case "google": return new firebase.auth.GoogleAuthProvider();
        case "github": return new firebase.auth.GithubAuthProvider();
        case "apple": return new firebase.auth.OAuthProvider("apple.com");
        default: throw new Error("unsupported provider: " + providerId);
        }
    }

    /** Nothing usable is configured: every entry point reports it instead of failing silently. */
    function unconfigured() {
        return Promise.reject(new Error(
            "Firebase is not configured on the server: set FIREBASE_API_KEY and " +
            "FIREBASE_PROJECT_ID in .env and restart the server (.env is read only at startup). " +
            "The server log names the missing variables."
        ));
    }

    if (!window.firebase) return;

    if (!config.apiKey || !config.projectId) {
        window.__vexExternalIdentitySignIn = unconfigured;
        window.__vexExternalIdentityResume = function () { return Promise.resolve(null); };
        return;
    }

    firebase.initializeApp(config);
    var auth = firebase.auth();

    /**
     * Start a sign-in. In "redirect" mode this navigates the page away and the returned promise never
     * settles — which is correct, and why the caller does not need to know which mode is in use.
     */
    window.__vexExternalIdentitySignIn = function (providerId) {
        var provider = providerFor(providerId);

        if (settings.signInMethod === "redirect") {
            return auth.signInWithRedirect(provider);
        }

        return auth.signInWithPopup(provider).then(function () {
            return auth.currentUser.getIdToken();
        }).catch(function (err) {
            throw new Error(describe(err));
        });
    };

    /**
     * Complete a redirect sign-in, or resolve null when this page load is not a return from one.
     * Called once on page load; a no-op outside redirect mode.
     */
    window.__vexExternalIdentityResume = function () {
        if (settings.signInMethod !== "redirect") return Promise.resolve(null);

        return auth.getRedirectResult().then(function (result) {
            if (!result || !result.user) return null;
            return result.user.getIdToken();
        }).catch(function (err) {
            throw new Error(describe(err));
        });
    };
})();`,
        csp: {
            scriptSrc: [
                // gapi: Firebase Auth loads it at sign-in time to sync the popup over an iframe.
                "https://apis.google.com",
                // reCAPTCHA, used by some Auth flows; also injected without a nonce.
                "https://www.gstatic.com",
                "https://www.google.com",
            ],
        },
        configChecks: [
            {
                key: "appId",
                warnIfMatches: ":(android|ios):",
                message:
                    "FIREBASE_APP_ID is a mobile app registration. The login page is a web client and " +
                    "needs a *Web* app's appId from the same Firebase project (Project settings → " +
                    "Your apps → Add app → Web). A mobile API key is usually also restricted to that " +
                    "app's package name and signing certificate, which makes every web request fail " +
                    "with a generic error.",
            },
        ],
    },
};

export const presets: Record<string, externalIdentityPreset> = { firebase };

/** Fully resolved settings, with every default applied. Consumed by the generators. */
export interface resolvedExternalIdentity {
    /** Namespace label for the broker layer. */
    providerLabel: string;
    issuer: string;
    jwksUrl: string | null;
    discovery: boolean;
    audience: string | null;
    audienceClaim: string;
    algorithms: string[];
    identityLayer: "auto" | "broker" | "upstream";
    upstreamProvider: { claim: string; map: Record<string, string> } | null;
    upstreamSub: { from: string; keyedByProvider: boolean } | null;
    claims: { id: string; email: string; emailVerified: string; username: string[] };
    onMissingEmail: "reject" | "synthesize";
    ui: externalIdentityUI;
    /** Preset name, or `null` for a hand-written config. Emitted as a comment. */
    presetName: string | null;
}

export type resolveResult =
    | { ok: true; value: resolvedExternalIdentity }
    | { ok: false; error: string };

/** Claims or algorithms that a hand-written config may omit; the preset values are the fallback. */
function asString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function substitute(pattern: string, vars: Record<string, unknown>): string {
    return pattern.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const value = asString(vars[name]);
        return value ?? whole;
    });
}

/**
 * Merge a project's `auth.externalIdentity` with the preset it names, and validate the result.
 *
 * Validation is generation-time and loud: every rule here is a configuration mistake that would
 * otherwise surface as a runtime failure (or worse, as a verifier that accepts the wrong tokens).
 */
export function resolveExternalIdentity(config: types.externalIdentityOptions): resolveResult {
    const presetName = asString(config.preset);
    const preset = presetName ? presets[presetName] : undefined;

    if (presetName && !preset) {
        return { ok: false, error: `unknown preset "${presetName}" (known: ${Object.keys(presets).join(", ")})` };
    }

    if (!preset && !asString(config.issuer)) {
        return { ok: false, error: "either \"preset\" or \"issuer\" is required" };
    }

    if (preset) {
        const missing = preset.requires.filter((name) => !asString(config[name]));
        if (missing.length > 0) {
            return {
                ok: false,
                error: `preset "${presetName}" requires: ${missing.join(", ")}`,
            };
        }
    }

    const algorithms = config.algorithms ?? preset?.algorithms ?? ["RS256"];
    const symmetric = algorithms.filter((alg) => /^HS/i.test(alg) || alg === "none");
    if (symmetric.length > 0) {
        return {
            ok: false,
            error: `algorithms must be asymmetric; refusing ${symmetric.join(", ")} (alg-confusion risk)`,
        };
    }

    const discovery = config.discovery ?? preset?.discovery ?? false;
    const jwksUrl = config.jwksUrl ?? null;
    if (!discovery && !jwksUrl) {
        return { ok: false, error: "set discovery to true or provide jwksUrl" };
    }

    const issuer = asString(config.issuer)
        ?? (preset ? substitute(preset.issuerPattern, config) : undefined);
    if (!issuer) {
        return { ok: false, error: "could not resolve an issuer from the preset or config" };
    }

    const audienceClaim = asString(config.audienceClaim) ?? preset?.audienceClaim ?? "aud";
    let audience = asString(config.audience);
    if (!audience && preset) {
        if (preset.audienceFrom === "explicit") {
            return { ok: false, error: "this preset needs an explicit audience" };
        }
        audience = asString(config[preset.audienceFrom]);
    }

    const identityLayer = config.identityLayer ?? "auto";
    const upstreamProvider = preset?.upstreamProvider ?? null;
    const upstreamSub = preset?.upstreamSub ?? null;
    if (identityLayer === "upstream" && (!upstreamProvider || !upstreamSub)) {
        return {
            ok: false,
            error: "identityLayer \"upstream\" requires a preset that exposes an upstream subject",
        };
    }

    const providerLabel = asString(config.providerLabel) ?? preset?.brokerLabel;
    if (!providerLabel) {
        return { ok: false, error: "providerLabel is required when no preset supplies one" };
    }
    if (providerLabel === "local") {
        // "local" is reserved: verifyPassword finds the password row by provider === "local"
        // (src/templates/_utils/hash.ts), so a broker claiming it would break local login.
        return { ok: false, error: "providerLabel \"local\" is reserved by vex's own password path" };
    }

    const presetClaims = preset?.claims;
    const claims = {
        id: asString(config.claims?.id) ?? presetClaims?.id ?? "sub",
        email: asString(config.claims?.email) ?? presetClaims?.email ?? "email",
        emailVerified: asString(config.claims?.emailVerified) ?? presetClaims?.emailVerified ?? "email_verified",
        username: config.claims?.username ?? presetClaims?.username ?? ["email", "sub"],
    };

    const presetUI = preset?.ui;
    if (!presetUI) {
        return {
            ok: false,
            error: "no login-page wiring for this configuration; a preset is required for the generated UI",
        };
    }

    const signInMethod = asString(config.signInMethod) ?? presetUI.signInMethod;
    if (signInMethod !== "popup" && signInMethod !== "redirect") {
        return { ok: false, error: `signInMethod must be "popup" or "redirect", got "${signInMethod}"` };
    }
    const ui: externalIdentityUI = { ...presetUI, signInMethod };

    return {
        ok: true,
        value: {
            providerLabel,
            issuer,
            jwksUrl,
            discovery,
            audience: audience ?? null,
            audienceClaim,
            algorithms,
            identityLayer,
            upstreamProvider,
            upstreamSub,
            claims,
            onMissingEmail: config.onMissingEmail ?? preset?.onMissingEmail ?? "reject",
            ui,
            presetName: preset ? presetName! : null,
        },
    };
}

export default {
    presets,
    firebase,
    resolveExternalIdentity,
};
