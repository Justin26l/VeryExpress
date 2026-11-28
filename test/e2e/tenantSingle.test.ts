import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

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
 * One account belongs to one tenant, and a token is the only source of a tenant: the middleware
 * never reads `x-tenant-id`, so registration cannot pick a tenant and a caller cannot spoof one.
 * Login resolves the membership — one row mints the claim, no row leaves the token claimless, and
 * several rows are a 409. The mode generates no tenant endpoint, so a claimless token cannot be
 * repaired over HTTP; the app links the account itself, which this suite seeds directly in SQL.
 */
const describeE2E = process.env.VEX_E2E === "1" ? describe : describe.skip;

const ROOT = path.join(E2E_ROOT, "tenant-single");
const APP_DIR_SINGLE = path.join(ROOT, "app");
const PORT = 3203;
const SCHEMA_FIXTURES = path.join(repoRoot, "test", "fixtures", "e2e", "schemas");

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

/** The generated entity: `@Entity("usertenant")` with `userId` / `tenantId` columns. */
const USER_TENANT_TABLE = "usertenant";

function sslOf(url: string): Record<string, unknown> | undefined {
    if (new URL(url).searchParams.get("sslmode") !== "require") return undefined;

    const raw = process.env.SQL_CA;
    const ca = !raw ? undefined : raw.startsWith("-----BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const insecure = (process.env.SQL_INSECURE_TLS || "").toLowerCase() === "true";

    return { rejectUnauthorized: insecure ? false : true, ca };
}

describeE2E("generated app — tenant single mode", () => {
    let app: RunningApp;
    let dbStartedByUs = false;
    let dbUrl = "";
    let db: Client;

    const run = Date.now();
    const suffix = String(run).padStart(12, "0").slice(-12);
    const tenantA = `11111111-1111-4111-8111-${suffix}`;
    const tenantB = `22222222-2222-4222-8222-${suffix}`;

    const password = "Secret123!";
    const emailA = `single-a+${run}@test.local`;
    const emailB = `single-b+${run}@test.local`;
    const emailNoTenant = `single-none+${run}@test.local`;
    const emailAmbiguous = `single-many+${run}@test.local`;
    const emailHeaderAttempt = `single-header+${run}@test.local`;
    const emailCreate = `single-create+${run}@test.local`;

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

    async function login(email: string): Promise<{ status: number; body: any }> {
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

    async function linkMembership(userId: string, tenantId: string): Promise<void> {
        await db.query(
            `insert into "${USER_TENANT_TABLE}" ("_id", "userId", "tenantId") values ($1, $2, $3)`,
            [crypto.randomUUID(), userId, tenantId],
        );
    }

    async function membershipCount(userId: string): Promise<number> {
        const result = await db.query(
            `select count(*)::int as count from "${USER_TENANT_TABLE}" where "userId" = $1`,
            [userId],
        );
        return result.rows[0].count as number;
    }

    beforeAll(async () => {
        generateAppAt(CONFIG, ROOT, SCHEMA_FIXTURES);

        installAppIfNeeded();
        const modulesLink = path.join(APP_DIR_SINGLE, "node_modules");
        if (!fs.existsSync(modulesLink)) {
            fs.symlinkSync(path.join(APP_DIR, "node_modules"), modulesLink, "dir");
        }
        buildApp(APP_DIR_SINGLE);

        const postgres = await ensurePostgres();
        dbStartedByUs = postgres.startedByUs;
        dbUrl = postgres.url;
        app = await startApp(dbUrl, { appDir: APP_DIR_SINGLE, port: PORT });

        db = new Client({ connectionString: dbUrl, ssl: sslOf(dbUrl) });
        await db.connect();

        await register(emailA, tenantA);
        await register(emailB, tenantB);
        await register(emailNoTenant);
        await register(emailAmbiguous);
        await register(emailHeaderAttempt, tenantB);
        await register(emailCreate);

        for (const [email, tenantId] of [[emailA, tenantA], [emailB, tenantB]] as const) {
            const session = await login(email);
            await linkMembership(claimsOf(session.body.result.accessToken).vexUserId, tenantId);
        }

        const ambiguous = await login(emailAmbiguous);
        const ambiguousUserId = claimsOf(ambiguous.body.result.accessToken).vexUserId;
        await linkMembership(ambiguousUserId, tenantA);
        await linkMembership(ambiguousUserId, tenantB);
    }, 900_000);

    afterAll(async () => {
        await db?.end().catch(() => undefined);
        await app?.stop();
        if (dbStartedByUs) stopPostgres();
    });

    it("ignores the header on registration — a caller cannot pick a tenant", async () => {
        const session = await login(emailHeaderAttempt);
        expect(session.status).toBe(200);
        expect(claimsOf(session.body.result.accessToken).tenantId).toBeUndefined();

        expect(await membershipCount(claimsOf(session.body.result.accessToken).vexUserId)).toBe(0);
    });

    it("mints the claim at login when the account has one mapping", async () => {
        const { status, body } = await login(emailA);
        expect(status).toBe(200);

        expect(claimsOf(body.result.accessToken).tenantId).toBe(tenantA);
        expect(claimsOf(body.result.refreshToken).tenantId).toBe(tenantA);

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

    it("does not let a header supply a tenant to a claimless token", async () => {
        const { body } = await login(emailNoTenant);
        const res = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: { ...auth(body.result.accessToken, body.result.accessTokenIndex), "x-tenant-id": tenantA },
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect(res.status).toBe(401);
    });

    it("answers 409 tenant_ambiguous when the account carries two mappings", async () => {
        const { status, body } = await login(emailAmbiguous);
        expect(status).toBe(409);
        expect(body.ret_code).toBe("tenant_ambiguous");
    });

    it("creates the account's only tenant and returns a claimed token", async () => {
        const session = await login(emailCreate);
        expect(claimsOf(session.body.result.accessToken).tenantId).toBeUndefined();

        const created = await fetch(`${app.baseUrl}/api/tenant/create`, {
            method: "POST",
            headers: auth(session.body.result.accessToken, session.body.result.accessTokenIndex),
            body: JSON.stringify({ name: "Acme" }),
        });
        expect(created.status).toBe(201);

        const result = (await created.json()).result;
        expect(claimsOf(result.accessToken).tenantId).toEqual(expect.any(String));
        expect(claimsOf(result.refreshToken).tenantId).toBe(claimsOf(result.accessToken).tenantId);

        const tenantRow = await db.query(
            'select "name" from "tenant" where "_id" = $1',
            [claimsOf(result.accessToken).tenantId],
        );
        expect(tenantRow.rowCount, "tenant row registered").toBe(1);
        expect(tenantRow.rows[0].name).toBe("Acme");

        const scoped = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: auth(result.accessToken, result.accessTokenIndex),
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect(scoped.status).toBe(200);

        const again = await fetch(`${app.baseUrl}/api/tenant/create`, {
            method: "POST",
            headers: auth(result.accessToken, result.accessTokenIndex),
        });
        expect(again.status).toBe(409);
        expect((await again.json()).ret_code).toBe("tenant_exists");
    });

    it("serves the create page and links it from the home page", async () => {
        const page = await fetch(`${app.baseUrl}/tenant`);
        expect(page.status).toBe(200);
        expect(await page.text()).toContain("Create tenant");

        const home = await fetch(`${app.baseUrl}/`);
        expect(home.status).toBe(200);
        expect(await home.text()).toContain('href="/tenant"');
    });

    it("generates no tenant endpoint", async () => {
        const { body } = await login(emailA);
        const headers = auth(body.result.accessToken, body.result.accessTokenIndex);

        expect((await fetch(`${app.baseUrl}/api/tenant`, { headers })).status).toBe(404);

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
        expect((await created.json()).result.tenantId).toBe(tenantA);

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

    it("keeps the claim even when a request carries another tenant header", async () => {
        const a = await login(emailA);

        const res = await fetch(`${app.baseUrl}/api/project/search`, {
            method: "POST",
            headers: {
                ...auth(a.body.result.accessToken, a.body.result.accessTokenIndex),
                "x-tenant-id": tenantB,
            },
            body: JSON.stringify({ filter: {}, pagination: { page: 1, perPage: 20 } }),
        });
        expect(res.status).toBe(200);
        expect((await res.json()).result.total).toBe(1);
    });
});
