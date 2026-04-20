import typeormMigrationTemplate from "./typeormMigration.template";
import utils from "./../../utils";
import log from "./../../utils/logger";

import * as types from "./../../types/types";

function jsonTypeToSqlType(type: string | undefined, maxLength?: number): string {
    switch (type) {
    case "integer": return "int";
    case "number":  return "float";
    case "boolean": return "boolean";
    case "array":
    case "object":
    case "json":    return "jsonb";
    default:        return maxLength ? `varchar(${maxLength})` : "varchar";
    }
}

/**
 * Compile JSON Schema → TypeORM migration source code
 */
export async function compile(options: {
    jsonSchema: types.jsonSchema,
    outDir: string,
    compilerOptions: types.compilerOptions,
}): Promise<void> {
    const schema = options.jsonSchema as types.jsonSchema;
    const documentName = schema["x-documentConfig"].documentName;

    log.process(`TypeORM Migration : ${documentName}`);

    type TableDef = { name: string; columns: string[]; indexes: string[]; foreigns: string[] };
    const tables: TableDef[] = [];

    function getOrCreateTable(tableName: string): TableDef {
        tableName = tableName.toLowerCase();
        let t = tables.find((x) => x.name === tableName);
        if (!t) {
            t = { name: tableName, columns: [], indexes: [], foreigns: [] };
            tables.push(t);
        }
        return t;
    }

    // ensure main table exists
    getOrCreateTable(documentName);

    const requiredFields: string[] = Array.isArray(schema.required) ? schema.required : [];

    function addColumnToTable(tbl: TableDef, colName: string, prop: types.jsonSchemaPropsItem | undefined) {
        if (!prop) return;
        if (tbl.columns.some((c) => c.includes(`name: "${colName}"`))) return;

        const isUuidPrimary = colName === "_id" && prop["x-format"] === "PrimaryUUID";
        const isPrimary = isUuidPrimary || prop["x-format"] === "PrimaryIncrements" || prop["x-format"] === "Primary";
        const isNullable = !isPrimary && !requiredFields.includes(colName);
        const sqlType = isPrimary ? (isUuidPrimary ? "uuid" : "int") : jsonTypeToSqlType(prop.type, prop.maxLength);

        if (isPrimary && isUuidPrimary) {
            tbl.columns.push(`{ name: "${colName}", type: "uuid", isPrimary: true, isGenerated: true, generationStrategy: "uuid", default: "gen_random_uuid()" }`);
        } else if (isPrimary) {
            tbl.columns.push(`{ name: "${colName}", type: "int", isPrimary: true, isGenerated: true, generationStrategy: "increment" }`);
        } else {
            tbl.columns.push(`{ name: "${colName}", type: "${sqlType}", isNullable: ${isNullable} }`);
        }

        if (prop.index) {
            tbl.indexes.push(`await queryRunner.createIndex("${tbl.name}", new TableIndex({ name: "idx_${tbl.name}_${colName}", columnNames: ["${colName}"] }));`);
        }
    }

    function processProperties(props: { [key: string]: types.jsonSchemaPropsItem } | undefined, parentTable: string) {
        if (!props) return;
        const tbl = getOrCreateTable(parentTable);
        for (const key of Object.keys(props)) {
            addColumnToTable(tbl, key, props[key]);
        }
    }

    // ensure primary key exists
    const mainTable = getOrCreateTable(documentName);
    if (!mainTable.columns.some(c => c.includes("isPrimary: true"))) {
        mainTable.columns.unshift(`{ name: "_id", type: "uuid", isPrimary: true, isGenerated: true, generationStrategy: "uuid", default: "gen_random_uuid()" }`);
    }

    processProperties(schema.properties, documentName);

    const outPath = `${options.outDir}/${documentName}Migration.gen.ts`;
    utils.common.writeFile("TypeORM Migration",
        outPath,
        typeormMigrationTemplate({
            documentName,
            tables,
            compilerOptions: options.compilerOptions,
        })
    );
}

export default {
    compile,
};

export async function compileMigrationsManifest(manifestPath: string, documents: Array<{ path: string; config: types.documentConfig; schema: types.jsonSchema }>, options: types.compilerOptions): Promise<void> {
    try {
        const manifest: Array<{ filename: string; table: string; dependsOn: string[] }> = [];
        for (const doc of documents) {
            const deps: string[] = [];
            const props = (doc.schema && (doc.schema as unknown as { properties?: Record<string, types.jsonSchemaPropsItem> }).properties) || {};
            Object.keys(props).forEach((key) => {
                const p = props[key];
                if (p && p["x-foreignKey"]) {
                    const fk = p["x-foreignKey"];
                    if (fk && fk.schemaName) deps.push(String(fk.schemaName).toLowerCase());
                }
            });
            manifest.push({
                filename: `${doc.config.documentName}Migration.gen.ts`,
                table: String(doc.config.documentName).toLowerCase(),
                dependsOn: Array.from(new Set(deps)),
            });
        }
        utils.common.writeFile("Migrations Manifest", manifestPath, JSON.stringify(manifest, null, 2));
    }
    catch (e: unknown) {
        log.error("Failed to write migrations manifest", e);
    }
}
