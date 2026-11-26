import { describe, expect, it } from "vitest";

import { checkConfigValid } from "../../src/utils/configChecker";
import {
    isAuthenticationEnabled,
    isAuthEnabled,
    isTokenVerificationEnabled,
    isVerifyOnlyAuthEnabled,
} from "../../src/utils/generator";
import * as types from "../../src/types/types";

function options(overrides: {
    verifyOnly?: boolean,
    localAuth?: boolean,
    firebase?: boolean,
    google?: boolean,
    roles?: string[],
    tenantMode?: types.TenantIsolationMode,
} = {}): types.compilerOptions {
    const compilerOptions: Record<string, unknown> = {
        rootDir: ".",
        srcDir: "./src",
        sysDir: "./src/system",
        openapiDir: "./openapi",
        jsonSchemaDir: "./jsonSchema",
        app: { useUserSchema: false },
        auth: {
            localAuth: overrides.localAuth ?? false,
            firebase: overrides.firebase ?? false,
            verifyOnly: overrides.verifyOnly ?? false,
            oauthProviders: { google: overrides.google ?? false },
        },
    };

    if (overrides.roles) compilerOptions.useRBAC = { roles: overrides.roles, default: overrides.roles[0] };
    if (overrides.tenantMode) compilerOptions.tenant = { enable: true, IsolationMode: overrides.tenantMode };

    return compilerOptions as unknown as types.compilerOptions;
}

describe("verify-only predicates", () => {
    it("is not a sign-in method", () => {
        const compilerOptions = options({ verifyOnly: true });

        expect(isVerifyOnlyAuthEnabled(compilerOptions)).toBe(true);
        expect(isAuthEnabled(compilerOptions)).toBe(false);
        expect(isAuthenticationEnabled(compilerOptions)).toBe(true);
        expect(isTokenVerificationEnabled(compilerOptions)).toBe(true);
    });

    it("leaves a project with no auth at all untouched", () => {
        expect(isAuthenticationEnabled(options())).toBe(false);
        expect(isTokenVerificationEnabled(options())).toBe(false);
    });

    it("adds token verification to a JWT sign-in app but not a Firebase-only one", () => {
        expect(isTokenVerificationEnabled(options({ localAuth: true }))).toBe(true);
        expect(isTokenVerificationEnabled(options({ firebase: true }))).toBe(false);
    });
});

describe("verify-only config validation", () => {
    it("accepts a verify-only app", () => {
        expect(() => checkConfigValid(options({ verifyOnly: true }))).not.toThrow();
    });

    it("rejects a sign-in method next to verify-only", () => {
        expect(() => checkConfigValid(options({ verifyOnly: true, localAuth: true }))).toThrow(/sign-in method/);
        expect(() => checkConfigValid(options({ verifyOnly: true, firebase: true }))).toThrow(/sign-in method/);
        expect(() => checkConfigValid(options({ verifyOnly: true, google: true }))).toThrow(/sign-in method/);
    });

    it("rejects RBAC next to verify-only", () => {
        expect(() => checkConfigValid(options({ verifyOnly: true, roles: ["member"] }))).toThrow(/useRBAC/);
    });

    it("rejects tenant option mode next to verify-only", () => {
        expect(() => checkConfigValid(options({ verifyOnly: true, tenantMode: "option" }))).toThrow(/mints a tenant-scoped token/);
    });

    it("accepts tenant preSelect mode next to verify-only", () => {
        expect(() => checkConfigValid(options({ verifyOnly: true, tenantMode: "preSelect" }))).not.toThrow();
    });

    it("rejects a non-boolean verifyOnly", () => {
        const compilerOptions = options({ verifyOnly: "true" as unknown as boolean });

        expect(() => checkConfigValid(compilerOptions)).toThrow(/auth.verifyOnly must be true or false/);
    });
});
