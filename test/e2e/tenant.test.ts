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
 * Tenant isolation — `option` mode, end to end.
 *
 * Login is tenant-agnostic. The client lists the user's tenants, selects one, and receives a
 * token whose `tenantId` claim scopes every later request. Two users in two tenants must not
 * see each other's rows; a guest falls back to the header.
 */
const describeE2E = process.env.VEX_E2E === "1" ? describe : describe.skip;

const ROOT = path.join(E2E_ROOT, "tenant-option");
const APP_DIR_OPTION = path.join(ROOT, "app");
const PORT = 3201;

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
        localAuth: true,
        useHttpOnlyCookieToken: true,
        deleteAccount: true,
        oauthProviders: { google: false, github: false },
    },
    useRBAC: { roles: ["visitor", "member", "admin"], default: "admin" },
    tenant: { enable: true, IsolationMode: "option" },
    generator: { commitBeforeGenerate: false },
};

describeE2E("generated app — tenant option mode", () => {
    let app: RunningApp;
    let dbStartedByUs = false;

    const run = Date.now();
    const suffix = String(run).padStart(12, "0").slice(-12);
    const tenantA = `11111111-1111-4111-8111-${suffix}`;
    const tenantB = `22222222-2222-4222-8222-${suffix}`;

    const password = "Secret123!";
    const emailA = `option-a+${run}@test.local`;
    const emailB = `option-b+${run}@test.local`;

    let tokenA: string;
    let indexA: string;
    let tokenB: string;
    let indexB: string;
    let preSelectTokenA: string;
    let preSelectIndexA: string;
    let userIdA: string;
    let projectA: string;

    const auth = (token: string, index: string) => ({
        Authorization: `Bearer ${token}`,
        "X-Auth-Index": index,
        "Content-Type": "application/json",
    });

    async function register(email: string, tenantId: string): Promise<void> {
        const res = await fetch(`${app.baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
            body: JSON.stringify({ email, password }),
        });
        expect(res.status, `register ${email}`).toBe(201);
    }

    async function login(email: string): Promise<{ accessToken: string; accessTokenIndex: string }> {
        const loginRes = await fetch(`${app.baseUrl}/api/auth/local`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        expect(loginRes.status, `login ${email}`).toBe(302);

        const code = new URL(`http://localhost${(await loginRes.json()).result.url}`).searchParams.get("code");
        const tokenRes = await fetch(`${app.baseUrl}/api/auth/token?code=${code}`, { method: "POST" });
        expect(tokenRes.status, `exchange ${email}`).toBe(200);

        return (await tokenRes.json()).result;
    }

    async function selectTenant(
        token: string,
        index: string,
        tenantId: string,
    ): Promise<{ accessToken: string; accessTokenIndex: string }> {
        const res = await fetch(`${app.baseUrl}/api/tenant/select`, {
            method: "POST",
            headers: auth(token, index),
            body: JSON.stringify({ tenantId }),
        });
        expect(res.status, `select ${tenantId}`).toBe(200);
        return (await res.json()).result;
    }

    const claimsOf = (token: string) =>
        JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));

    beforeAll(async () => {
        generateAppAt(
            CONFIG,
            ROOT,
            path.join(repoRoot, "test", "fixtures", "e2e", "schemas"),
        );
        installAppIfNeeded();
        const modulesLink = path.join(APP_DIR_OPTION, "node_modules");
        if (!fs.existsSync(modulesLink)) {
            fs.symlinkSync(path.join(APP_DIR, "node_modules"), modulesLink, "dir");
        }
        buildApp(APP_DIR_OPTION);

        const db = await ensurePostgres();
        dbStartedByUs = db.startedByUs;
        app = await startApp(db.url, { appDir: APP_DIR_OPTION, port: PORT });

        await register(emailA, tenantA);
        await register(emailB, tenantB);
    }, 900_000);

    afterAll(async () => {
        await app?.stop();
        if (dbStartedByUs) stopPostgres();
    });

    it("logs in without a tenant, then selects one", async () => {
        const a = await login(emailA);
        expect(claimsOf(a.accessToken).tenantId).toBeUndefined();

        const listed = await fetch(`${app.baseUrl}/api/tenant`, { headers: auth(a.accessToken, a.accessTokenIndex) });
        expect(listed.status).toBe(200);
        expect((await listed.json()).result.tenants).toEqual([{ tenantId: tenantA }]);

        const selected = await selectTenant(a.accessToken, a.accessTokenIndex, tenantA);
        expect(claimsOf(selected.accessToken).tenantId).toBe(tenantA);

        preSelectTokenA = a.accessToken;
        preSelectIndexA = a.accessTokenIndex;
        tokenA = selected.accessToken;
        indexA = selected.accessTokenIndex;
        userIdA = claimsOf(tokenA).vexUserId;

        const b = await login(emailB);
        const selectedB = await selectTenant(b.accessToken, b.accessTokenIndex, tenantB);
        tokenB = selectedB.accessToken;
        indexB = selectedB.accessTokenIndex;
    });

    it("refuses a tenant the user does not belong to", async () => {
        const pre = await login(emailA);
        const res = await fetch(`${app.baseUrl}/api/tenant/select`, {
            method: "POST",
            headers: auth(pre.accessToken, pre.accessTokenIndex),
            body: JSON.stringify({ tenantId: tenantB }),
        });
        expect(res.status).toBe(403);
    });

    it("rejects a protected request from a token without a tenant", async () => {
        const res = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: auth(preSelectTokenA, preSelectIndexA),
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect(res.status).toBe(401);
    });

    it("stamps the token's tenant on create", async () => {
        const res = await fetch(`${app.baseUrl}/api/project`, {
            method: "POST",
            headers: auth(tokenA, indexA),
            body: JSON.stringify({ title: "Option mode project" }),
        });
        expect(res.status).toBe(201);

        const { result } = await res.json();
        projectA = result._id;
        expect(result.tenantId).toBe(tenantA);
    });

    it("keeps tenants apart", async () => {
        const own = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: auth(tokenA, indexA),
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect(own.status).toBe(200);
        expect((await own.json()).result.total).toBe(1);

        const other = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: auth(tokenB, indexB),
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect((await other.json()).result.total).toBe(0);

        const get = await fetch(`${app.baseUrl}/api/project/${projectA}`, {
            headers: auth(tokenB, indexB),
        });
        expect(get.status).toBe(404);

        const del = await fetch(`${app.baseUrl}/api/project/${projectA}`, {
            method: "DELETE",
            headers: auth(tokenB, indexB),
        });
        expect(del.status).toBe(404);
    });

    it("uses the token claim over the header", async () => {
        const res = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: { ...auth(tokenA, indexA), "x-tenant-id": tenantB },
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect(res.status).toBe(200);
        expect((await res.json()).result.total).toBe(1);
    });

    it("requires credentials for guest CRUD routes", async () => {
        // generated CRUD controllers carry @Security, so the header fallback is not reachable
        // there; it applies to unsecured routes (auth UI, custom public controllers)
        const res = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-tenant-id": tenantA },
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect(res.status).toBe(401);
    });

    it("refuses a forged tenant in the request body", async () => {
        const res = await fetch(`${app.baseUrl}/api/project/${projectA}`, {
            method: "PATCH",
            headers: auth(tokenA, indexA),
            body: JSON.stringify({ title: "moved", tenantId: tenantB }),
        });
        expect(res.status).toBe(400);
    });

    it("leaves the tenant on account deletion instead of tombstoning the user", async () => {
        const res = await fetch(`${app.baseUrl}/api/auth/delete-account`, {
            method: "POST",
            headers: auth(tokenA, indexA),
        });
        expect(res.status).toBe(200);

        const { result } = await res.json();
        expect(result.tenantId).toBe(tenantA);
        expect(result.deleted.userTenants).toBe(1);
        expect(result.tombstonedAt).toBe("");

        const tenants = await fetch(`${app.baseUrl}/api/tenant`, { headers: auth(tokenA, indexA) });
        expect((await tenants.json()).result.tenants).toEqual([]);

        const user = await fetch(`${app.baseUrl}/api/user/${userIdA}`, { headers: auth(tokenA, indexA) });
        expect(user.status, "the account still exists").toBe(200);
    });
});
