import { describe, expect, it } from "vitest";

import authControllerTemplate from "../../src/generators/routes/authController.template";
import { resolveTenantContext } from "../../src/templates/_tenant/TenantScopeContext";
import * as types from "../../src/types/types";
import { checkConfigValid } from "../../src/utils/configChecker";
import { isTenantSingleMode, tenantIsolationMode, tenantUsesClaim } from "../../src/utils/generator";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

function options(overrides: {
    mode?: types.TenantIsolationMode,
    enable?: boolean,
    localAuth?: boolean,
    firebase?: boolean,
    verifyOnly?: boolean,
    deleteAccount?: boolean,
} = {}): types.compilerOptions {
    const compilerOptions: Record<string, unknown> = {
        rootDir: ".",
        srcDir: "./src",
        sysDir: "./src/system",
        openapiDir: "./openapi",
        jsonSchemaDir: "./jsonSchema",
        app: { useUserSchema: false },
        auth: {
            localAuth: overrides.localAuth ?? true,
            firebase: overrides.firebase ?? false,
            verifyOnly: overrides.verifyOnly ?? false,
            deleteAccount: overrides.deleteAccount ?? false,
            oauthProviders: { google: false, github: false },
        },
    };

    if (overrides.mode) {
        compilerOptions.tenant = { enable: overrides.enable ?? true, IsolationMode: overrides.mode };
    }

    return compilerOptions as unknown as types.compilerOptions;
}

describe("tenant isolation mode — single", () => {
    it("defaults to preSelect when IsolationMode is omitted", () => {
        expect(tenantIsolationMode({ tenant: { enable: true } } as unknown as types.compilerOptions)).toBe("preSelect");
    });

    it("is recognised only when the module is enabled", () => {
        expect(isTenantSingleMode(options({ mode: "single" }))).toBe(true);
        expect(isTenantSingleMode(options({ mode: "single", enable: false }))).toBe(false);
        expect(isTenantSingleMode(options({ mode: "option" }))).toBe(false);
    });

    it("takes the request tenant from the token claim, like option and unlike preSelect", () => {
        expect(tenantUsesClaim(options({ mode: "preSelect" }))).toBe(false);
        expect(tenantUsesClaim(options({ mode: "option" }))).toBe(true);
        expect(tenantUsesClaim(options({ mode: "single" }))).toBe(true);
    });
});

describe("configChecker — single mode validation", () => {
    it("accepts single next to a JWT sign-in method", () => {
        expect(() => checkConfigValid(options({ mode: "single" }))).not.toThrow();
    });

    it("refuses single next to verify-only, which issues no token", () => {
        expect(() => checkConfigValid(options({ mode: "single", localAuth: false, verifyOnly: true })))
            .toThrow(/IsolationMode is "single" cannot be combined with auth\.verifyOnly/);
    });

    it("refuses single without a JWT sign-in method, because login is where the claim is minted", () => {
        expect(() => checkConfigValid(options({ mode: "single", localAuth: false, firebase: true })))
            .toThrow(/IsolationMode is "single" needs a JWT sign-in method/);
    });

    it("refuses single with the module turned off", () => {
        expect(() => checkConfigValid(options({ mode: "single", enable: false })))
            .toThrow(/IsolationMode is "single" but tenant\.enable is false/);
    });

    it("names the three modes when the value is unknown", () => {
        expect(() => checkConfigValid(options({ mode: "both" as types.TenantIsolationMode })))
            .toThrow(/must be "preSelect", "option" or "single"/);
    });

    it("leaves the option and preSelect rules untouched", () => {
        expect(() => checkConfigValid(options({ mode: "option", localAuth: false, verifyOnly: true })))
            .toThrow(/mints a tenant-scoped token/);
        expect(() => checkConfigValid(options({ mode: "preSelect", localAuth: false, verifyOnly: true })))
            .not.toThrow();
    });
});

describe("resolveTenantContext — single", () => {
    it("uses the token claim over the header", () => {
        expect(resolveTenantContext("single", { tenantId: TENANT_A }, TENANT_B)).toEqual({ tenantId: TENANT_A });
    });

    it("rejects a token without a claim — login resolves it, so absence is a bug", () => {
        expect(resolveTenantContext("single", {}, TENANT_A)).toEqual({ error: "missing-claim" });
    });

    it("falls back to the header for a guest request", () => {
        expect(resolveTenantContext("single", undefined, TENANT_A)).toEqual({ tenantId: TENANT_A });
    });
});

describe("AuthController template — single mode", () => {
    it("resolves the membership in both login paths and mints the claim", () => {
        const source = authControllerTemplate(options({ mode: "single", firebase: true }));
        const lookups = source.match(/singleUserTenant\(/g) ?? [];

        // exchangeToken, firebaseLogin, refresh fallback
        expect(lookups.length).toBe(3);
        expect(source).toContain("generateAccessToken(user, undefined, membershipTenantId ? { tenantId: membershipTenantId } : undefined)");
        expect(source).toContain("generateRefreshToken({ vexUserId: this.JWTService.userIdOf(user), ...(membershipTenantId ? { tenantId: membershipTenantId } : {}) })");
    });

    it("keeps a claim the refresh token already carries", () => {
        const source = authControllerTemplate(options({ mode: "single" }));

        expect(source).toContain("const claimTenant = payload.tenantId;");
        expect(source).toContain("if (claimTenant === undefined) {");
    });

    it("attaches TenantScope to the delete-account route, as option mode does", () => {
        expect(authControllerTemplate(options({ mode: "single", deleteAccount: true })))
            .toContain("Authentication.middleware, TenantScope.middleware");
    });

    it("emits no membership resolution in option mode", () => {
        const source = authControllerTemplate(options({ mode: "option", firebase: true }));

        expect(source).not.toContain("singleUserTenant");
        expect(source).toContain("const claimTenant = payload.tenantId;");
    });

    it("emits no claim at all in preSelect mode", () => {
        const source = authControllerTemplate(options({ mode: "preSelect" }));

        expect(source).not.toContain("singleUserTenant");
        expect(source).not.toContain("claimTenant");
        expect(source).toContain("const isTenantMember = await this.tenantService.hasUserTenant(");
    });
});
