import { describe, expect, it } from "vitest";

import authControllerTemplate from "../../src/generators/routes/authController.template";
import * as types from "../../src/types/types";
import { checkConfigValid } from "../../src/utils/configChecker";
import { isTenantSingleMode, tenantIsolationMode, tenantUsesClaim } from "../../src/utils/generator";

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

    it("never links a tenant from the request on registration", () => {
        const source = authControllerTemplate(options({ mode: "single" }));

        expect(source).not.toContain("requestedTenantId");
        expect(source).not.toContain("linkUserTenant");
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

describe("Tenant endpoints across modes", () => {
    it("emits create in single and option, and nothing in preSelect", async () => {
        const fs = await import("node:fs");
        const os = await import("node:os");
        const path = await import("node:path");
        const { compile } = await import("../../src/generators/controller/tenantController.generator");
        const { setCompilerOptions } = await import("../../src/utils/common");

        const emitFor = async (mode: types.TenantIsolationMode) => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), `vex-tenant-ctrl-${mode}-`));
            const compilerOptions = options({ mode });
            const withDirs = { ...compilerOptions, rootDir: root } as types.compilerOptions;
            setCompilerOptions(withDirs);
            await compile({
                compilerOptions: withDirs,
                controllerDir: path.join(root, "controllers"),
                typeDir: path.join(root, "types"),
            });
            return root;
        };

        const single = await emitFor("single");
        const singleSource = fs.readFileSync(path.join(single, "controllers", "TenantController.gen.ts"), "utf8");
        expect(singleSource).toContain('@Post("create")');
        expect(singleSource).not.toContain('@Post("select")');
        expect(singleSource).not.toContain("@Get()");
        expect(fs.existsSync(path.join(single, "types", "Tenant.gen.ts"))).toBe(false);

        const option = await emitFor("option");
        const optionSource = fs.readFileSync(path.join(option, "controllers", "TenantController.gen.ts"), "utf8");
        expect(optionSource).toContain('@Post("create")');
        expect(optionSource).toContain('@Post("select")');
        expect(optionSource).toContain("@Get()");
        expect(fs.existsSync(path.join(option, "types", "TenantList.gen.ts"))).toBe(true);

        const preSelect = await emitFor("preSelect");
        expect(fs.existsSync(path.join(preSelect, "controllers", "TenantController.gen.ts"))).toBe(false);
    });
});
