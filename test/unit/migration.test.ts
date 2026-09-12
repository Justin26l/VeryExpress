import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { migrateSchemaFile } from "../../src/migrations/v0.6.14-alpha";

const tempDirs: string[] = [];

afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Write a schema fixture to a throwaway dir and return its path. */
function writeSchema(content: unknown): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vex-migrate-"));
    tempDirs.push(dir);
    const file = path.join(dir, "Legacy.json");
    fs.writeFileSync(file, JSON.stringify(content, null, 4), "utf8");
    return file;
}

function readSchema(file: string): any {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Migration v0.6.14-alpha reshapes `x-documentConfig` — methods, joinWhitelist
 * and noRelations move under `restApi`. This runs on every fresh generation, so
 * it must be correct and idempotent.
 */
describe("migration v0.6.14-alpha: migrateSchemaFile", () => {
    it("moves the old flat fields under restApi and drops them", () => {
        const file = writeSchema({
            title: "Legacy",
            "x-documentConfig": {
                documentName: "Legacy",
                methods: ["get", "post"],
                apiJoinWhitelist: ["parent"],
                noApiRelations: true,
                uniqueIndex: [["code"]],
            },
        });

        expect(migrateSchemaFile(file)).toBe(true);

        const migrated = readSchema(file);
        expect(migrated["x-documentConfig"]).toEqual({
            documentName: "Legacy",
            restApi: {
                methods: ["get", "post"],
                joinWhitelist: ["parent"],
                noRelations: true,
            },
            uniqueIndex: [["code"]],
        });
    });

    it("respects an already-migrated restApi block", () => {
        const file = writeSchema({
            "x-documentConfig": {
                documentName: "Current",
                methods: ["get"],
                restApi: { methods: ["patch"], joinWhitelist: [] },
            },
        });

        migrateSchemaFile(file);

        expect(readSchema(file)["x-documentConfig"].restApi).toEqual({
            methods: ["patch"],
            joinWhitelist: [],
        });
    });

    it("maps apiSkipRoute to an empty methods list", () => {
        const file = writeSchema({
            "x-documentConfig": { documentName: "NoRoute", apiSkipRoute: true, methods: ["get"] },
        });

        migrateSchemaFile(file);

        expect(readSchema(file)["x-documentConfig"].restApi.methods).toEqual([]);
    });

    it("is idempotent — a second run changes nothing", () => {
        const file = writeSchema({
            "x-documentConfig": {
                documentName: "Legacy",
                methods: ["get"],
                noApiRelations: true,
                uniqueIndex: [["code"]],
            },
        });

        migrateSchemaFile(file);
        const once = readSchema(file);

        migrateSchemaFile(file);
        expect(readSchema(file)).toEqual(once);
    });

    it("leaves a schema with no x-documentConfig untouched", () => {
        const file = writeSchema({ title: "Plain" });

        expect(migrateSchemaFile(file)).toBe(false);
        expect(readSchema(file)).toEqual({ title: "Plain" });
    });
});
