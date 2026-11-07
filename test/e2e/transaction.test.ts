import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    APP_DIR,
    E2E_ROOT,
    buildApp,
    ensurePostgres,
    generateAppAt,
    installAppIfNeeded,
    stopPostgres,
} from "../helpers/e2e";
import { repoRoot } from "../helpers/paths";

/**
 * G1: the transaction entry owned by the DB layer.
 *
 * A small probe is written into the generated app, compiled with it, and run against
 * Postgres. It proves the transaction handle still applies isolation and audit stamping,
 * fails closed on `deny`, rolls back on throw, and refuses nesting.
 */
const describeE2E = process.env.VEX_E2E === "1" ? describe : describe.skip;

const ROOT = path.join(E2E_ROOT, "transaction");
const TX_APP_DIR = path.join(ROOT, "app");
const TENANT = "55555555-5555-4555-8555-555555555555";
const USER = "66666666-6666-4666-8666-666666666666";

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
    tenant: { enable: true, IsolationMode: "option" },
    generator: { commitBeforeGenerate: false },
};

const PROBE = `import VexDb from "./system/_services/VexDb.gen";
import UserContext from "./system/_middlewares/UserContext.gen";
import { ProjectEntity, Project } from "./system/_models/ProjectModel.gen";
import { VexResErr, Filter } from "./system/_types/vex";

const tenantId = process.env.TX_TENANT as string;
const userId = process.env.TX_USER as string;
const context = { tokenData: { vexUserId: userId }, tenantId };

async function waitForDb(): Promise<void> {
    VexDb.connect();
    for (let attempt = 0; attempt < 200; attempt++) {
        try {
            VexDb.getRepository<Project>(ProjectEntity);
            return;
        } catch {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    throw new Error("database did not become ready");
}

async function main(): Promise<void> {
    await waitForDb();
    const out: Record<string, unknown> = {};

    out.stamped = await UserContext.run(context, async () => {
        return VexDb.transaction(async (tx) => {
            // @ts-expect-error the transaction handle never exposes the manager or data source
            tx.dataSource;

            const repo = tx.getRepository<Project>(ProjectEntity);
            const row = await repo.save({ title: "transaction row" } as Partial<Project>);
            return row.tenantId;
        });
    });

    try {
        await VexDb.transaction(async (tx) => {
            await tx.getRepository<Project>(ProjectEntity).create({ title: "no context" } as Partial<Project>);
        });
        out.deny = "no-error";
    } catch (error) {
        out.deny = error instanceof VexResErr ? error.status : String(error);
    }

    try {
        await UserContext.run(context, async () => {
            await VexDb.transaction(async (tx) => {
                const repo = tx.getRepository<Project>(ProjectEntity);
                await repo.create({ title: "rollback rows" } as Partial<Project>);
                await repo.create({ title: "rollback rows" } as Partial<Project>);
                throw new Error("rollback now");
            });
        });
    } catch {
        // expected
    }

    out.afterRollback = await UserContext.run(context, async () => {
        const repo = VexDb.getRepository<Project>(ProjectEntity);
        return repo.count({ title: { $like: "rollback%" } } as unknown as Filter<Project>);
    });

    try {
        await VexDb.transaction(async () => {
            await VexDb.transaction(async () => undefined);
        });
        out.nested = "no-error";
    } catch (error) {
        out.nested = error instanceof Error ? error.message : String(error);
    }

    console.log("TX_RESULT:" + JSON.stringify(out));
    VexDb.close();
    setTimeout(() => process.exit(0), 200);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
`;

describeE2E("generated app — database transaction", () => {
    let result: Record<string, unknown>;
    let dbStartedByUs = false;

    beforeAll(async () => {
        generateAppAt(CONFIG, ROOT, path.join(repoRoot, "test", "fixtures", "e2e", "schemas"));
        fs.writeFileSync(path.join(TX_APP_DIR, "src", "e2eTxProbe.ts"), PROBE, "utf8");

        installAppIfNeeded();
        const modulesLink = path.join(TX_APP_DIR, "node_modules");
        if (!fs.existsSync(modulesLink)) {
            fs.symlinkSync(path.join(APP_DIR, "node_modules"), modulesLink, "dir");
        }
        buildApp(TX_APP_DIR);

        const db = await ensurePostgres();
        dbStartedByUs = db.startedByUs;

        const run = spawnSync(process.execPath, ["dist/e2eTxProbe.js"], {
            cwd: TX_APP_DIR,
            encoding: "utf8",
            env: { ...process.env, SQL_URI: db.url, SQL_SYNCHRONIZE: "true", TX_TENANT: TENANT, TX_USER: USER },
        });

        if (run.status !== 0) {
            throw new Error(`probe failed (${run.status})\n${run.stdout}\n${run.stderr}`);
        }

        const line = run.stdout.split("\n").find(entry => entry.startsWith("TX_RESULT:")) as string;
        result = JSON.parse(line.slice("TX_RESULT:".length));
    }, 900_000);

    afterAll(() => {
        if (dbStartedByUs) stopPostgres();
    });

    it("stamps the tenant inside the transaction", () => {
        expect(result.stamped).toBe(TENANT);
    });

    it("fails closed when the transaction has no tenant context", () => {
        expect(result.deny).toBe(403);
    });

    it("rolls every write back when the callback throws", () => {
        expect(result.afterRollback).toBe(0);
    });

    it("refuses a nested transaction", () => {
        expect(result.nested).toBe("nested transaction is not supported");
    });
});
