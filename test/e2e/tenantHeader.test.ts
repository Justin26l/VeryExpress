import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    APP_DIR,
    E2E_ROOT,
    buildApp,
    ensurePostgres,
    generateAppAt,
    installAppIfNeeded,
    startApp,
    stopPostgres,
    type RunningApp,
} from "../helpers/e2e";
import { repoRoot } from "../helpers/paths";

/**
 * Tenant isolation in `header` mode — no accounts, no token.
 *
 * This is the shape of a white-label client: the app build sends a fixed tenant header and
 * the server scopes every row to it. It proves the tenant module is generated on its own,
 * without the auth module.
 */
const describeE2E = process.env.VEX_E2E === "1" ? describe : describe.skip;

const APP_ROOT = path.join(E2E_ROOT, "tenant-header");
const HEADER_APP_DIR = path.join(APP_ROOT, "app");
const HEADER_PORT = 3200;

const CONFIG = {
    jsonSchemaDir: "./schemas",
    rootDir: "./app",
    dbType: "sql",
    app: {
        enableSwagger: true,
        useUserSchema: true,
        useObjectID: true,
        allowApiCreateUpdate_id: false,
    },
    auth: {
        localAuth: false,
        useHttpOnlyCookieToken: false,
        deleteAccount: false,
        oauthProviders: { google: false, github: false },
    },
    tenant: { enable: true, IsolationMode: "preSelect", scope: ["/api"] },
    generator: { commitBeforeGenerate: false },
};

describeE2E("generated app — tenant header mode (no auth)", () => {
    let app: RunningApp;
    let dbStartedByUs = false;

    const run = Date.now();
    const suffix = String(run).padStart(12, "0").slice(-12);
    const tenantA = `11111111-1111-4111-8111-${suffix}`;
    const tenantB = `22222222-2222-4222-8222-${suffix}`;
    let projectA: string;

    const tenantHeaders = (tenant?: string) => ({
        "Content-Type": "application/json",
        ...(tenant ? { "x-tenant-id": tenant } : {}),
    });

    beforeAll(async () => {
        generateAppAt(
            CONFIG,
            APP_ROOT,
            path.join(repoRoot, "test", "fixtures", "e2e", "schemas"),
        );
        installAppIfNeeded();
        const modulesLink = path.join(HEADER_APP_DIR, "node_modules");
        if (!fs.existsSync(modulesLink)) {
            fs.symlinkSync(path.join(APP_DIR, "node_modules"), modulesLink, "dir");
        }
        buildApp(HEADER_APP_DIR);

        const db = await ensurePostgres();
        dbStartedByUs = db.startedByUs;
        app = await startApp(db.url, { appDir: HEADER_APP_DIR, port: HEADER_PORT });
    }, 900_000);

    afterAll(async () => {
        await app?.stop();
        if (dbStartedByUs) stopPostgres();
    });

    it("generates the tenant module and no auth controller", () => {
        expect(fs.existsSync(path.join(HEADER_APP_DIR, "src/system/_middlewares/TenantScope.gen.ts"))).toBe(true);
        expect(fs.existsSync(path.join(HEADER_APP_DIR, "src/system/_middlewares/TenantScopeContext.gen.ts"))).toBe(true);
        expect(fs.existsSync(path.join(HEADER_APP_DIR, "src/system/_services/TenantService.gen.ts"))).toBe(true);
        // preSelect resolves at L0; the tenant chooser belongs to option mode
        expect(fs.existsSync(path.join(HEADER_APP_DIR, "src/system/_controllers/TenantController.gen.ts"))).toBe(false);
        expect(fs.existsSync(path.join(HEADER_APP_DIR, "src/system/_controllers/AuthController.gen.ts"))).toBe(false);
        // the module copies its own mapping table into the schema dir
        expect(fs.existsSync(path.join(APP_ROOT, "schemas", "UserTenant.json"))).toBe(true);
    });

    it("stamps the header tenant on create", async () => {
        const res = await fetch(`${app.baseUrl}/api/project`, {
            method: "POST",
            headers: tenantHeaders(tenantA),
            body: JSON.stringify({ title: "Header mode project" }),
        });
        expect(res.status).toBe(201);

        const { result } = await res.json();
        projectA = result._id;
        expect(result.tenantId).toBe(tenantA);
    });

    it("keeps tenants apart without any token", async () => {
        const own = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: tenantHeaders(tenantA),
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect(own.status).toBe(200);
        expect((await own.json()).result.total).toBe(1);

        const other = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: tenantHeaders(tenantB),
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect((await other.json()).result.total).toBe(0);

        const get = await fetch(`${app.baseUrl}/api/project/${projectA}`, {
            headers: tenantHeaders(tenantB),
        });
        expect(get.status).toBe(404);
    });

    it("keeps non-API paths reachable without a tenant header", async () => {
        const spec = await fetch(`${app.baseUrl}/swagger/openapi.json`);
        expect(spec.status).toBe(200);

        const hello = await fetch(`${app.baseUrl}/hello`);
        expect(hello.status).toBe(200);
    });

    it("rejects a request without a tenant header", async () => {
        const list = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: tenantHeaders(),
            body: JSON.stringify({ filter: {} }),
        });
        expect(list.status).toBe(400);

        const create = await fetch(`${app.baseUrl}/api/project`, {
            method: "POST",
            headers: tenantHeaders(),
            body: JSON.stringify({ title: "no tenant" }),
        });
        expect(create.status).toBe(400);
    });
});
