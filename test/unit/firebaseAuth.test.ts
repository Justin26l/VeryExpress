import { describe, expect, it } from "vitest";

import * as template from "../../src/generators/services/firebaseAuth.template";
import { checkConfigValid } from "../../src/utils/configChecker";
import { defaultCompilerOptions, isAuthEnabled, isFirebaseAuthEnabled } from "../../src/utils/generator";
import * as types from "../../src/types/types";

/** A config with every required path filled in, so only the key under test varies. */
function options(auth: Partial<types.compilerOptions["auth"]>): types.compilerOptions {
    return {
        ...defaultCompilerOptions,
        auth: { ...defaultCompilerOptions.auth, ...auth },
    };
}

describe("auth.firebase — the switch", () => {
    it("is off by default", () => {
        expect(defaultCompilerOptions.auth.firebase).toBe(false);
        expect(isFirebaseAuthEnabled(options({}))).toBe(false);
    });

    it("counts as auth on its own, with no local auth and no passport provider", () => {
        const firebaseOnly = options({ localAuth: false, firebase: true, oauthProviders: {} });

        expect(isAuthEnabled(firebaseOnly)).toBe(true);
        expect(isFirebaseAuthEnabled(firebaseOnly)).toBe(true);
    });

    it("is refused when it is not a boolean, rather than silently staying off", () => {
        const broken = options({ firebase: "true" as unknown as boolean });

        expect(() => checkConfigValid(broken)).toThrow("vex.config.auth.firebase must be true or false");
    });
});

describe("FirebaseAuthService — the identity rule", () => {
    const source = template.serviceModule({ rbac: false, defaultRole: "user" });

    it("maps Firebase's provider ids to the labels the passport doors already write", () => {
        expect(source).toContain("\"google.com\": \"google\"");
        expect(source).toContain("\"github.com\": \"github\"");
        expect(source).toContain("\"apple.com\": \"apple\"");
        expect(source).toContain("\"microsoft.com\": \"microsoft\"");
    });

    it("never writes the broker as a provider", () => {
        expect(source).not.toContain("provider: \"firebase\"");
        expect(source).not.toContain("providerLabel");
    });

    it("refuses a sign-in with no upstream provider instead of filing it under the broker", () => {
        expect(source).toContain("This sign-in method has no upstream identity provider");
    });

    it("refuses a known provider whose subject is missing instead of falling back", () => {
        expect(source).toContain("Invalid Firebase ID token: the upstream identity is missing");
    });

    it("gates the email fallback on a verified address", () => {
        expect(source).toContain("if (email && emailVerified)");
    });

    it("reads the identities claim without leaning on firebase-admin's any", () => {
        expect(source).toContain("const identities: unknown = decoded.firebase.identities;");
        expect(source).toContain("Reflect.get(identities, signInProvider)");
    });

    it("assigns the configured role only when RBAC is on", () => {
        expect(source).not.toContain("RoleEnum");
        expect(source).not.toContain("userRoleRepo");

        const withRbac = template.serviceModule({ rbac: true, defaultRole: "admin" });
        expect(withRbac).toContain("role: RoleEnum.admin");
    });
});

describe("FirebaseAdmin — the credential", () => {
    const source = template.adminModule();

    it("takes the service account from FIREBASE_SERVICE_ACCOUNT_JSON, and nowhere else", () => {
        expect(source).toContain("FIREBASE_SERVICE_ACCOUNT_JSON");
        expect(source).not.toContain("FIREBASE_SERVICE_ACCOUNT_PATH");
    });

    it("accepts Google's snake_case key file, not just the SDK's camelCase type", () => {
        // A downloaded service-account JSON spells them project_id / private_key / client_email.
        // Reading only the camelCase spelling rejects every genuine key and shows up as a bare 503.
        expect(source).toContain('readServiceAccountField(value, "projectId", "project_id")');
        expect(source).toContain('readServiceAccountField(value, "privateKey", "private_key")');
        expect(source).toContain('readServiceAccountField(value, "clientEmail", "client_email")');
    });

    it("starts the app even when the credential is absent, so the endpoint can answer 503", () => {
        expect(source).toContain("isFirebaseAvailable");
        expect(source).toContain("cert(serviceAccount)");
    });
});

describe("FirebaseAuthUI — the browser wiring", () => {
    const ui = template.firebaseAuthUIDefaults;

    it("loads the modular SDK as ES modules from a pinned gstatic URL", () => {
        // Modular, not compat: the app's own web sign-in uses getAuth/signInWithPopup, and the page
        // mirrors it. It cannot be served from node_modules — firebase-auth.js there imports
        // firebase-app.js from gstatic, which would be a second module instance.
        expect(ui.sdkBaseUrl).toMatch(/^https:\/\/www\.gstatic\.com\/firebasejs\/\d+\.\d+\.\d+\/$/);
        expect(ui.sdkBaseUrl).toContain("12.19.0");
    });

    it("allows gstatic for the modules and apis.google.com for the loader Auth injects", () => {
        expect(ui.csp.scriptSrc).toContain("https://www.gstatic.com");
        expect(ui.csp.scriptSrc).toContain("https://apis.google.com");
    });

    it("allows the token endpoints the SDK calls, and the auth window it frames", () => {
        expect(ui.csp.connectSrc).toContain("https://identitytoolkit.googleapis.com");
        expect(ui.csp.connectSrc).toContain("https://securetoken.googleapis.com");
        expect(ui.csp.frameSrc).toContain("https://accounts.google.com");
    });

    it("reads the public config from the names a deployment already has", () => {
        // Not FIREBASE_API_KEY / _APP_ID: Firebase Auth reads neither a differently named key nor an
        // appId at all, so generating code that demanded one would be a requirement with no purpose.
        expect(ui.envKeys).toEqual({
            apiKey: "FIREBASE_WEB_API_KEY",
            authDomain: "FIREBASE_WEB_AUTH_DOMAIN",
            projectId: "FIREBASE_WEB_PROJECT_ID",
        });
    });
});
