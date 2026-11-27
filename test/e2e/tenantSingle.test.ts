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
 * Tenant isolation — `single` mode, end to end.
 *
 * One account belongs to one tenant. Login is the only place the claim is minted: exactly one
 * `UserTenant` row puts `tenantId` into both tokens, no row leaves them claimless so the app can
 * guide the account through creating its tenant, and several rows are a 409. The mode generates no
 * tenant endpoint, so a claimless token cannot be repaired over HTTP.
 *
 * The schema fixtures ship `UserTenant` with a `POST` endpoint on purpose: it is the only way a
 * test can create the second row of the 409 case, because single mode has no select route.
 */
const describeE2E = process.env.VEX_E2E === "1" ? describe : describe.skip;

const ROOT = path.join(E2E_ROOT, "tenant-single");
const APP_DIR_SINGLE = path.join(ROOT, "app");
const PORT = 3203;
const SCHEMA_FIXTURES = path.join(repoRoot, "test", "fixtures", "e2e", "schemas-single");

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
        deleteAccount: false,
        oauthProviders: { google: false, github: false },
    },
    useRBAC: { roles: ["visitor", "member", "admin"], default: "admin" },
    tenant: { enable: true, IsolationMode: "single" },
    generator: { commitBeforeGenerate: false },
};

describeE2E("generated app — tenant single mode", () => {
    let app: RunningApp;
    let dbStartedByUs = false;

    const run = Date.now();
    const suffix = String(run).padStart(12, "0").slice(-12);
    const tenantA = `11111111-1111-4111-8111-${suffix}`;
    const tenantB = `22222222-2222-4222-8222-${suffix}`;

    const password = "Secret123!";
    const emailA = `single-a+${run}@test.local`;
    const emailB = `single-b+${run}@test.local`;
    const emailNoTenant = `single-none+${run}@test.local`;
    const emailAmbiguous = `single-many+${run}@test.local`;

    const auth = (token: string, index: string) => ({
        Authorization: `Bearer ${token}`,
        "X-Auth-Index": index,
        "Content-Type": "application/json",
    });

    const claimsOf = (token: string) =>
        JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));

    async function register(email: string, tenantId?: string): Promise<void> {
        const res = await fetch(`${app.baseUrl}/api/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(tenantId ? { "x-tenant-id": tenantId } : {}),
            },
            body: JSON.stringify({ email, password }),
        });
        expect(res.status, `register ${email}`).toBe(201);
    }

    async function login(email: string): Promise<{
        status: number;
        body: any;
    }> {
        const loginRes = await fetch(`${app.baseUrl}/api/auth/local`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        if (loginRes.status !== 302) return { status: loginRes.status, body: await loginRes.json() };

        const code = new URL(`http://localhost${(await loginRes.json()).result.url}`).searchParams.get("code");
        const tokenRes = await fetch(`${app.baseUrl}/api/auth/token?code=${code}`, { method: "POST" });

        return { status: tokenRes.status, body: await tokenRes.json() };
    }

    beforeAll(async () => {
        generateAppAt(CONFIG, ROOT, SCHEMA_FIXTURES);

        installAppIfNeeded();
        const modulesLink = path.join(APP_DIR_SINGLE, "node_modules");
        if (!fs.existsSync(modulesLink)) {
            fs.symlinkSync(path.join(APP_DIR, "node_modules"), modulesLink, "dir");
        }
        buildApp(APP_DIR_SINGLE);

        const db = await ensurePostgres();
        dbStartedByUs = db.startedByUs;
        app = await startApp(db.url, { appDir: APP_DIR_SINGLE, port: PORT });

        await register(emailA, tenantA);
        await register(emailB, tenantB);
        await register(emailNoTenant);
        await register(emailAmbiguous, tenantA);
    }, 900_000);

    afterAll(async () => {
        await app?.stop();
        if (dbStartedByUs) stopPostgres();
    });

    it("mints the claim at login when the account has one mapping", async () => {
        const { status, body } = await login(emailA);
        expect(status).toBe(200);

        const access = claimsOf(body.result.accessToken);
        expect(access.tenantId).toBe(tenantA);

        const refresh = claimsOf(body.result.refreshToken);
        expect(refresh.tenantId).toBe(tenantA);

        const refreshed = await fetch(`${app.baseUrl}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                refreshToken: body.result.refreshToken,
                refreshTokenIndex: body.result.refreshTokenIndex,
            }),
        });
        expect(refreshed.status).toBe(200);
        expect(claimsOf((await refreshed.json()).result.accessToken).tenantId).toBe(tenantA);
    });

    it("logs in without a claim when the account has no mapping", async () => {
        const { status, body } = await login(emailNoTenant);
        expect(status).toBe(200);
        expect(claimsOf(body.result.accessToken).tenantId).toBeUndefined();
    });

    it("refuses a tenant-scoped request from the claimless token", async () => {
        const { body } = await login(emailNoTenant);
        const res = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: auth(body.result.accessToken, body.result.accessTokenIndex),
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect(res.status).toBe(401);
    });

    it("answers 409 tenant_ambiguous when the account carries two mappings", async () => {
        const first = await login(emailAmbiguous);
        expect(first.status).toBe(200);
        const userId = claimsOf(first.body.result.accessToken).vexUserId;

        const inserted = await fetch(`${app.baseUrl}/api/usertenant`, {
            method: "POST",
            headers: auth(first.body.result.accessToken, first.body.result.accessTokenIndex),
            body: JSON.stringify({ userId, tenantId: tenantB }),
        });
        expect(inserted.status, "second UserTenant row").toBe(201);

        const second = await login(emailAmbiguous);
        expect(second.status).toBe(409);
        expect(second.body.ret_code).toBe("tenant_ambiguous");
    });

    it("generates no tenant endpoint", async () => {
        const { body } = await login(emailA);
        const headers = auth(body.result.accessToken, body.result.accessTokenIndex);

        const list = await fetch(`${app.baseUrl}/api/tenant`, { headers });
        expect(list.status).toBe(404);

        const select = await fetch(`${app.baseUrl}/api/tenant/select`, {
            method: "POST",
            headers,
            body: JSON.stringify({ tenantId: tenantB }),
        });
        expect(select.status).toBe(404);
    });

    it("scopes rows by the login claim", async () => {
        const a = await login(emailA);
        const b = await login(emailB);

        const created = await fetch(`${app.baseUrl}/api/project`, {
            method: "POST",
            headers: auth(a.body.result.accessToken, a.body.result.accessTokenIndex),
            body: JSON.stringify({ title: "Single mode project" }),
        });
        expect(created.status).toBe(201);
        const project = (await created.json()).result;
        expect(project.tenantId).toBe(tenantA);

        const own = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: auth(a.body.result.accessToken, a.body.result.accessTokenIndex),
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect((await own.json()).result.total).toBe(1);

        const other = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: auth(b.body.result.accessToken, b.body.result.accessTokenIndex),
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect((await other.json()).result.total).toBe(0);
    });
});
