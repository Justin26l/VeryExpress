import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    buildApp,
    ensurePostgres,
    generateApp,
    installAppIfNeeded,
    readSpec,
    resolveRef,
    startApp,
    stopPostgres,
    type RunningApp,
} from "../helpers/e2e";

/**
 * End-to-end contract test for a generated app.
 *
 * Opt-in: it installs the generated app's own dependencies and needs a Docker
 * Postgres, so it is far too slow for `npm test`. Run it with:
 *
 *   npm run test:e2e
 */
const describeE2E = process.env.VEX_E2E === "1" ? describe : describe.skip;

describeE2E("generated app — end-to-end contract", () => {
    let app: RunningApp;
    let spec: any;
    let dbStartedByUs = false;

    const email = `e2e+${Date.now()}@test.local`;
    const password = "Secret123!";
    let userId: string;
    let accessToken: string;
    let accessTokenIndex: string;

    const authHeaders = () => ({
        Authorization: `Bearer ${accessToken}`,
        "X-Auth-Index": accessTokenIndex,
    });

    beforeAll(async () => {
        generateApp();
        installAppIfNeeded();
        buildApp();

        const db = await ensurePostgres();
        dbStartedByUs = db.startedByUs;
        app = await startApp(db.url);
        spec = readSpec();
    }, 900_000);

    afterAll(async () => {
        await app?.stop();
        // leave an externally provided database alone
        if (dbStartedByUs) stopPostgres();
    });

    it("emits an OpenAPI 3 document and serves it", async () => {
        expect(spec.openapi).toMatch(/^3\./);
        expect(Object.keys(spec.paths).length).toBeGreaterThan(0);

        const res = await fetch(`${app.baseUrl}/swagger/openapi.json`);
        expect(res.status).toBe(200);
        // the served document must be the one on disk, not a stale copy
        expect(await res.json()).toEqual(spec);
    });

    it("routes every operation the spec declares", async () => {
        const unrouted: string[] = [];

        for (const [routePath, operations] of Object.entries<any>(spec.paths)) {
            for (const method of ["get", "post", "patch", "put", "delete"]) {
                if (!operations[method]) continue;

                const url = `${app.baseUrl}/api${routePath.replace("{id}", "00000000-0000-0000-0000-000000000000")}`;
                const res = await fetch(url, { method: method.toUpperCase() });

                // a declared operation must exist; 401/400/422 are all fine answers
                if (res.status === 404) unrouted.push(`${method.toUpperCase()} ${routePath}`);
            }
        }

        expect(unrouted, "operations declared in the spec but not routed").toEqual([]);
    });

    it("registers a user with the status the spec declares", async () => {
        const res = await fetch(`${app.baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        expect(Object.keys(spec.paths["/auth/register"].post.responses)).toContain(String(res.status));
        expect(res.status).toBe(201);
    });

    it("exchanges a local login for a session code", async () => {
        const res = await fetch(`${app.baseUrl}/api/auth/local`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        expect(res.status).toBe(302);
        const body = await res.json();
        expect(body.result.url).toMatch(/[?&]code=/);
    });

    it("exchanges the code for tokens", async () => {
        const login = await fetch(`${app.baseUrl}/api/auth/local`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const code = new URL(`http://localhost${(await login.json()).result.url}`).searchParams.get("code");

        const res = await fetch(`${app.baseUrl}/api/auth/token?code=${code}`, { method: "POST" });
        expect(res.status).toBe(200);

        const { result } = await res.json();
        expect(result.accessToken).toBeTruthy();
        expect(result.accessTokenIndex).toBeTruthy();
        expect(result.refreshToken).toBeTruthy();

        accessToken = result.accessToken;
        accessTokenIndex = result.accessTokenIndex;
        userId = JSON.parse(
            Buffer.from(result.accessToken.split(".")[1], "base64url").toString("utf8"),
        )._id;
    });

    /**
     * The auth service resolves the identity through the token claim, not through a hardcoded
     * `_id` — that is what lets the audit fields follow the schema's `x-vexData: "userId"` field.
     */
    it("carries the identity claims in the access token, and not in the profile", async () => {
        const login = await fetch(`${app.baseUrl}/api/auth/local`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const code = new URL(`http://localhost${(await login.json()).result.url}`).searchParams.get("code");
        const { result } = await (await fetch(`${app.baseUrl}/api/auth/token?code=${code}`, { method: "POST" })).json();

        const claims = JSON.parse(Buffer.from(result.accessToken.split(".")[1], "base64url").toString("utf8"));
        expect(claims.vexUserId).toBe(userId);
        expect(claims.vexRole).toEqual(["admin"]);

        // long-lived refresh tokens carry the identity pointer only — roles would go stale
        const refreshClaims = JSON.parse(Buffer.from(result.refreshToken.split(".")[1], "base64url").toString("utf8"));
        expect(refreshClaims.vexUserId).toBe(userId);
        expect(refreshClaims.vexRole).toBeUndefined();

        // the existing profile fields stay in the payload, so clients depending on them keep working
        expect(claims.email).toBe(email);
        expect(claims.roles).toEqual(["admin"]);
    });

    it("rejects an unauthenticated request to a secured operation", async () => {
        const res = await fetch(`${app.baseUrl}/api/user/${userId}`);
        expect(res.status).toBe(401);
    });

    it("reads the user back and matches the spec's response schema", async () => {
        const res = await fetch(`${app.baseUrl}/api/user/${userId}`, { headers: authHeaders() });
        expect(res.status).toBe(200);

        const body = await res.json();

        // `VexResponse_User_` -> the payload lives under `result`
        const envelope = resolveRef(spec, spec.paths["/user/{id}"].get.responses["200"]
            .content["application/json"].schema);
        const userSchema = resolveRef(spec, envelope.properties.result);

        expect(Object.keys(body.result).sort()).toEqual(Object.keys(userSchema.properties).sort());
        expect(body.result.email).toBe(email);
    });

    it("updates the user through PATCH", async () => {
        const name = `Renamed ${Date.now()}`;

        const res = await fetch(`${app.baseUrl}/api/user/${userId}`, {
            method: "PATCH",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        expect(res.status).toBe(200);

        const check = await fetch(`${app.baseUrl}/api/user/${userId}`, { headers: authHeaders() });
        expect((await check.json()).result.name).toBe(name);
    });

    /**
     * Audit fields are declared with reserved `default` keywords in the schema; the adapter
     * owns them. Registration created this row without a request context, so `createdBy`
     * stays NULL there — the write path must not fall over when there is no identity.
     */
    it("writes createdAt on create and leaves createdBy NULL without a request context", async () => {
        const res = await fetch(`${app.baseUrl}/api/user/${userId}`, { headers: authHeaders() });
        const user = (await res.json()).result;

        expect(user.createdAt, "onCreateTimestamp").toBeTruthy();
        expect(new Date(user.createdAt).toString()).not.toBe("Invalid Date");
        expect(user.createdBy ?? null, "no ALS context during register").toBeNull();
    });

    /**
     * `onCreate*` is written once: an update strips it and never re-injects, which is what makes
     * the ownership columns trustworthy. The caller cannot set them either — forged values are dropped.
     */
    it("keeps createdAt and createdBy across an update, and rejects forged audit values", async () => {
        const before = (await (await fetch(`${app.baseUrl}/api/user/${userId}`, { headers: authHeaders() })).json()).result;
        const forged = "00000000-0000-0000-0000-0000000000ff";

        const res = await fetch(`${app.baseUrl}/api/user/${userId}`, {
            method: "PATCH",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ name: `Audited ${Date.now()}`, createdBy: forged, createdAt: "1999-01-01T00:00:00.000Z", updatedBy: forged }),
        });
        expect(res.status).toBe(200);

        const after = (await (await fetch(`${app.baseUrl}/api/user/${userId}`, { headers: authHeaders() })).json()).result;

        expect(after.createdAt).toBe(before.createdAt);
        expect(after.createdBy ?? null).toBe(before.createdBy ?? null);
        expect(after.createdBy).not.toBe(forged);
        expect(after.updatedAt, "onUpdateTimestamp").toBeTruthy();
        expect(after.updatedBy, "onUpdateUserId comes from the request context").toBe(userId);
    });

    /**
     * The spec and the middleware must agree that BOTH credentials are required.
     *
     * A single security requirement object listing both schemes means AND; two
     * separate objects would mean OR, i.e. either credential alone would suffice —
     * which is what the generated decorators used to produce, contradicting
     * `_middlewares/tsoaAuthentication.ts`.
     */
    it("declares both credentials as one requirement, matching the middleware", () => {
        expect(spec.paths["/user/{id}"].get.security).toEqual([
            { BearerAuth: [], AuthIndex: [] },
        ]);
    });

    it("rejects a request carrying only one of the two credentials", async () => {
        const bearerOnly = await fetch(`${app.baseUrl}/api/user/${userId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        expect(bearerOnly.status, "Bearer alone must not be accepted").toBe(401);

        const indexOnly = await fetch(`${app.baseUrl}/api/user/${userId}`, {
            headers: { "X-Auth-Index": accessTokenIndex },
        });
        expect(indexOnly.status, "X-Auth-Index alone must not be accepted").toBe(401);
    });
});
