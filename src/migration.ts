/**
 * Migration index — called by CLI before generation.
 *
 * Reads lastGeneratedVersion from output/.vex/meta.json and runs any
 * migration scripts whose version is newer than the last generated version.
 *
 * Each migration lives in src/migrations/<version>.ts and exports:
 *   run(jsonSchemaDir: string): void
 */

import path from "path";
import fs from "fs";
import log from "~/utils/logger";
import * as v0_6_14_alpha from "~/migrations/v0.6.14-alpha";

interface MigrationEntry {
    version: string;
    /** Semver-sortable numeric tuple [major, minor, patch, preIndex] */
    order: [number, number, number, number];
    run: (jsonSchemaDir: string) => void;
}

const migrations: MigrationEntry[] = [
    {
        version: "0.6.14-alpha",
        order: [0, 6, 14, 0],
        run: v0_6_14_alpha.run,
    },
];

/**
 * Parse a version string like "0.6.14-alpha" into a sortable tuple.
 * Pre-release labels are treated as patch suffix index 0; absent label = 999.
 */
function parseVersion(version: string): [number, number, number, number] {
    const [numericPart, pre] = version.split("-");
    const [major, minor, patch] = numericPart.split(".").map(Number);
    const preIndex = pre ? 0 : 999; // pre-release < release
    return [major ?? 0, minor ?? 0, patch ?? 0, preIndex];
}

function compareVersion(a: [number, number, number, number], b: [number, number, number, number]): number {
    for (let i = 0; i < 4; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

function loadLastGeneratedVersion(rootDir: string): string | undefined {
    const metaPath = path.join(rootDir, ".vex", "meta.json");
    if (!fs.existsSync(metaPath)) {
        log.info("Migration: no meta.json found, assuming fresh project.");
        return undefined;
    }
    try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        return meta.lastGeneratedVersion as string | undefined;
    }
    catch {
        return undefined;
    }
}

/**
 * Run all migrations whose target version is greater than lastGeneratedVersion.
 * If no meta.json exists (fresh project), all migrations run.
 */
export function runMigrations(rootDir: string, jsonSchemaDir: string): void {
    const lastVersion = loadLastGeneratedVersion(rootDir);
    console.log(`Migration: last generated version: ${lastVersion ?? "none"}`);
    const lastOrder: [number, number, number, number] = lastVersion
        ? parseVersion(lastVersion)
        : [0, 0, 0, 0];

    const pending = migrations
        .filter((m) => compareVersion(m.order, lastOrder) > 0)
        .sort((a, b) => compareVersion(a.order, b.order));

    if (pending.length === 0) {
        log.info("Migration: no pending migrations.");
        return;
    }

    log.process(`Migration: running ${pending.length} migration(s) (last: ${lastVersion ?? "none"})`);

    for (const migration of pending) {
        log.process(`Migration: running v${migration.version}`);
        migration.run(jsonSchemaDir);
    }
}
