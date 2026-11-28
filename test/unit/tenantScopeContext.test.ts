import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { compile as compileContext } from "../../src/generators/middlewares/tenantScopeContext.generator";
import { compile as compileScope } from "../../src/generators/middlewares/tenantScope.generator";
import * as types from "../../src/types/types";
import { setCompilerOptions } from "../../src/utils/common";

const tempDirs: string[] = [];

afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function options(
    mode: types.TenantIsolationMode,
    rootDir: string,
    scope?: string[],
): types.compilerOptions {
    return {
        rootDir,
        srcDir: "./src",
        sysDir: "./src/system",
        openapiDir: "./openapi",
        jsonSchemaDir: "./jsonSchema",
        app: { useUserSchema: true },
        auth: { localAuth: true, oauthProviders: {} },
        tenant: { enable: true, IsolationMode: mode, ...(scope ? { scope } : {}) },
    } as unknown as types.compilerOptions;
}

/**
 * The mode is a generation-time constant, so the assertion is on the emitted source: each mode
 * must ship only its own branch. Each branch's behaviour is covered by the e2e suites
 * (`tenantHeader`, `tenant`, `tenantSingle`).
 */
async function emit(mode: types.TenantIsolationMode, scope?: string[]): Promise<{
    context: string;
    middleware: string;
}> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vex-tenant-${mode}-`));
    tempDirs.push(dir);

    const compilerOptions = options(mode, dir, scope);
    // `writeFile` reads the module-level options, which decide where `.vex/meta.json` lands.
    setCompilerOptions(compilerOptions);
    await compileContext({ compilerOptions, middlewareDir: dir });
    await compileScope({ compilerOptions, middlewareDir: dir });

    return {
        context: fs.readFileSync(path.join(dir, "TenantScopeContext.gen.ts"), "utf8"),
        middleware: fs.readFileSync(path.join(dir, "TenantScope.gen.ts"), "utf8"),
    };
}

describe("TenantScopeContext — preSelect emits the header path only", () => {
    it("takes no token and names only header errors", async () => {
        const { context } = await emit("preSelect");

        expect(context).toContain("headerTenantId: string | undefined");
        expect(context).not.toContain("tokenData");
        expect(context).toContain('"missing-header"');
        expect(context).toContain('"invalid-tenant"');
        expect(context).not.toContain("missing-claim");
    });

    it("keeps the shared UUID check", async () => {
        const { context } = await emit("preSelect");

        expect(context).toContain("export function isTenantId");
        expect(context).toContain("UUID_PATTERN");
    });
});

describe("TenantScopeContext — option emits claim plus guest header", () => {
    it("takes both sources and names every error", async () => {
        const { context } = await emit("option");

        expect(context).toContain("tokenData: Record<string, unknown> | undefined");
        expect(context).toContain("headerTenantId: string | undefined");
        expect(context).toContain('"missing-claim"');
        expect(context).toContain('"invalid-claim"');
        expect(context).toContain('"invalid-tenant"');
    });
});

describe("TenantScopeContext — single emits the claim path only", () => {
    it("takes no header argument", async () => {
        const { context } = await emit("single");

        expect(context).toContain("tokenData: Record<string, unknown> | undefined");
        expect(context).not.toContain("headerTenantId");
        expect(context).not.toContain("missing-header");
        expect(context).toContain('"missing-claim"');
        expect(context).toContain('"invalid-claim"');
    });
});

describe("TenantScope — single never reads the tenant header", () => {
    it("has no header constant, no header read, no requested tenant", async () => {
        const { middleware } = await emit("single");

        expect(middleware).not.toContain("x-tenant-id");
        expect(middleware).not.toContain("TENANT_HEADER");
        expect(middleware).not.toContain("req.headers");
        expect(middleware).not.toContain("requestedTenantId");
        expect(middleware).toContain("resolveTenantContext(store?.tokenData)");
    });

    it("keeps the claim errors only", async () => {
        const { middleware } = await emit("single");

        expect(middleware).toContain('"tenant not selected"');
        expect(middleware).toContain('"invalid tenant claim"');
        expect(middleware).not.toContain("missing-header");
        expect(middleware).not.toContain("x-tenant-id must be a UUID");
    });
});

describe("TenantScope — option and preSelect keep their header path", () => {
    it("option reads the header as the guest fallback", async () => {
        const { middleware } = await emit("option");

        expect(middleware).toContain("req.headers[TENANT_HEADER]");
        expect(middleware).toContain("store?.tokenData");
        expect(middleware).toContain("requestedTenantId");
    });

    it("preSelect requires the header and reads no token", async () => {
        const { middleware } = await emit("preSelect");

        expect(middleware).toContain("req.headers[TENANT_HEADER]");
        expect(middleware).toContain("resolveTenantContext(headerTenantId)");
        expect(middleware).not.toContain("store?.tokenData");
        expect(middleware).not.toContain("getStore");
    });

    it("applies tenant.scope to every mode", async () => {
        const { middleware } = await emit("single", ["/api"]);

        expect(middleware).toContain("inTenantScope(req.path)");
        expect(middleware).toContain('"/api"');
    });
});
