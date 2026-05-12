/**
 * Migration: v0.6.14-alpha
 *
 * x-documentConfig shape change:
 *   Before:
 *     { documentName, keyPrefix?, methods, uniqueIndex?, apiJoinWhitelist?, noApiRelations?, apiSkipRoute? }
 *   After:
 *     { documentName, keyPrefix?, uniqueIndex?, restApi: { methods, joinWhitelist?, noRelations? } }
 *
 * Dropped field: apiSkipRoute (no equivalent in new shape)
 */

import fs from "fs";
import path from "path";
import log from "~/utils/logger";

interface OldDocumentConfig {
    documentName: string;
    keyPrefix?: string;
    methods?: string[];
    uniqueIndex?: string[][];
    apiJoinWhitelist?: string[];
    noApiRelations?: boolean;
    apiSkipRoute?: boolean;
    restApi?: Partial<NewRestApi>;
    [key: string]: unknown;
}

interface NewRestApi {
    methods: string[];
    joinWhitelist?: string[];
    noRelations?: boolean;
}

interface NewDocumentConfig {
    documentName: string;
    keyPrefix?: string;
    uniqueIndex?: string[][];
    restApi: NewRestApi;
    [key: string]: unknown;
}

function migrateDocumentConfig(old: OldDocumentConfig, current: Record<string, any>): NewDocumentConfig {

    const restApi: NewRestApi = {
        methods: current.restApi?.methods ?? (old.apiSkipRoute ? [] : (old.methods ?? [])),
        joinWhitelist: current.restApi?.joinWhitelist ?? old.apiJoinWhitelist ?? undefined,
        noRelations: current.restApi?.noRelations ?? old.noApiRelations ?? undefined,
    };

    // filter undefined values from restApi
    Object.keys(restApi).forEach((k) => {
        if (restApi[k as keyof NewRestApi] === undefined) delete restApi[k as keyof NewRestApi];
    });
    
    // drop old fields and add restApi
    const { methods, apiJoinWhitelist, noApiRelations, apiSkipRoute, ...restOld } = old;

    const next: NewDocumentConfig = {
        ...restOld,
        restApi,
    };

    return next;
}

export function migrateSchemaFile(filePath: string): boolean {
    const raw = fs.readFileSync(filePath, "utf8");
    let schema: Record<string, unknown>;

    try {
        schema = JSON.parse(raw);
    }
    catch (err: any) {
        log.error(`Migration v0.6.14-alpha: failed to parse ${filePath}: ${err.message}`);
        return false;
    }

    const docConfig = schema["x-documentConfig"] as Record<string, unknown> | undefined;
    if (!docConfig) {
        log.info(`Migration v0.6.14-alpha: skip ${path.basename(filePath)} (no old fields)`);
        return false;
    }

    schema["x-documentConfig"] = migrateDocumentConfig(docConfig as OldDocumentConfig, docConfig);
    fs.writeFileSync(filePath, JSON.stringify(schema, null, 4), "utf8");
    log.writing(`Migration v0.6.14-alpha: migrated ${path.basename(filePath)}`);
    return true;
}

export function run(jsonSchemaDir: string): void {
    if (!fs.existsSync(jsonSchemaDir)) {
        log.warn(`Migration v0.6.14-alpha: jsonSchemaDir not found: ${jsonSchemaDir}`);
        return;
    }

    const files = fs.readdirSync(jsonSchemaDir).filter((f) => f.endsWith(".json"));
    let count = 0;

    for (const file of files) {
        const filePath = path.join(jsonSchemaDir, file);
        if (migrateSchemaFile(filePath)) count++;
    }

    log.info(`Migration v0.6.14-alpha: done. ${count} file(s) migrated.`);
}
