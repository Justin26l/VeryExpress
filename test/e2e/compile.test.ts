import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";

import { compileVariant, E2E_ROOT } from "../helpers/e2e";

/**
 * Type-check a generated app for several config variants.
 *
 * Opt-in, like the contract test (needs the generated app's dependency tree):
 *
 *   npm run test:e2e
 *
 * Why this exists: "RBAC off + local auth on" was unreachable for as long as an
 * empty `useRBAC` aborted generation. The moment it became reachable it turned out
 * to contain three generated references to things that do not exist without RBAC —
 * an unimported `UserRole` type, an unimported `@Security` decorator, and a
 * `userRole` relation on `UserWithRelations`. All three are invisible to the golden
 * tests (they compare text, not types) and only surface when the app is compiled.
 */

const baseApp = {
    enableSwagger: true,
    useUserSchema: true,
    useObjectID: true,
    allowApiCreateUpdate_id: false,
};

const auth = (localAuth: boolean) => ({
    localAuth,
    useHttpOnlyCookieToken: true,
    oauthProviders: { google: false, github: false },
});

const variants: Record<string, Record<string, unknown>> = {
    "rbac-on-auth-on": {
        dbType: "sql",
        app: baseApp,
        auth: auth(true),
        useRBAC: { roles: ["visitor", "member", "admin"], default: "admin" },
    },
    "rbac-off-auth-on": {
        dbType: "sql",
        app: baseApp,
        auth: auth(true),
    },
    "rbac-on-auth-off": {
        dbType: "sql",
        app: baseApp,
        auth: auth(false),
        useRBAC: { roles: ["member"], default: "member" },
    },
    "rbac-off-auth-off": {
        dbType: "sql",
        app: baseApp,
        auth: auth(false),
    },
};

function configFor(config: Record<string, unknown>): Record<string, unknown> {
    return {
        jsonSchemaDir: "./schemas",
        rootDir: "./app",
        generator: { commitBeforeGenerate: false },
        ...config,
    };
}

describe.skipIf(process.env.VEX_E2E !== "1")("generated app — compiles for every config variant", () => {
    beforeAll(() => {
        if (!fs.existsSync(`${E2E_ROOT}/app/node_modules`)) {
            throw new Error("Run `npm run test:e2e` first — the shared dependency tree is missing.");
        }
    });

    afterAll(() => {
        fs.rmSync(`${E2E_ROOT}/variants`, { recursive: true, force: true });
    });

    for (const [name, config] of Object.entries(variants)) {
        it(`compiles "${name}"`, () => {
            const { errors, workDir } = compileVariant(name, configFor(config));
            expect(errors, `tsc errors in ${workDir}`).toEqual([]);
        }, 300_000);
    }

    /**
     * The Mongoose target does not type-check at all today — eight errors with auth
     * off, eleven with it on. Nothing to do with RBAC: the Mongoose model template
     * does not re-export the entity types its importers expect, its `ref` schema
     * definitions do not satisfy `SchemaDefinitionProperty`, and
     * `MongooseRepositoryAdapter` is not assignable to `VexRepository<T>`.
     *
     * Asserted as an expected failure so the gap is recorded in the suite rather than
     * silently skipped: when the Mongoose target starts compiling, this turns red and
     * should be promoted into the matrix above.
     */
    it.fails("compiles the mongo target (known gap — Mongoose support is incomplete)", () => {
        const { errors, workDir } = compileVariant("mongo-rbac-off-auth-on", configFor({
            dbType: "mongo",
            app: baseApp,
            auth: auth(true),
        }));
        expect(errors, `tsc errors in ${workDir}`).toEqual([]);
    }, 300_000);
});
