import knexTemplate from "./knex.template";
import utils from "./../../utils";
import log from "./../../utils/logger";

import * as types from "./../../types/types";

/**
 * compile jsonschema to knex migration source code
 * @param options
 */
export async function compile(options: {
    jsonSchema: types.jsonSchema,
    outDir: string,
    compilerOptions: types.compilerOptions,
}): Promise<void> {
    const schema = options.jsonSchema as types.jsonSchema;
    const documentName = schema["x-documentConfig"].documentName;

    log.process(`Knex : ${documentName}`);

    // const props = schema.properties || {};
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

    function addPrimitiveColumnToTable(tbl: TableDef, colName: string, prop: types.jsonSchemaPropsItem | undefined, tblName: string) {
        if (!prop) return;
        // avoid duplicate column
        if (tbl.columns.some((c) => c.includes(`"${colName}"`))) return;

        // determine column type
        let line = "";
        // const tname = tblName;
        switch (prop.type) {
        case "string":
            if (prop.maxLength) {
                line = `      table.string("${colName}", ${prop.maxLength})`;
            } else {
                line = `      table.string("${colName}")`;
            }
            break;
        case "integer":
            line = `      table.integer("${colName}")`;
            break;
        case "number":
            line = `      table.float("${colName}")`;
            break;
        case "boolean":
            line = `      table.boolean("${colName}")`;
            break;
        case "array":
        case "object":
        case "json":
            line = `      table.json("${colName}")`;
            break;
        default:
            line = `      table.specificType("${colName}", "text")`;
        }

        if (prop.required === true || (Array.isArray(schema.required) && schema.required.includes(colName))) {
            line += ".notNullable()";
        }

        if (prop.default !== undefined) {
            const def = JSON.stringify(prop.default);
            line += `.defaultTo(${def})`;
        }

        line += ";";
        tbl.columns.push(line);

        if (prop.index) {
            tbl.indexes.push(`    table.index(["${colName}"], "idx_${tbl.name}_${colName}");`);
        }

        if (prop["x-foreignKey"]) {
            const fkConfig = prop["x-foreignKey"];
            const ref = fkConfig.fieldName;
            const fkTable = String(fkConfig.schemaName).toLowerCase();
            tbl.foreigns.push(`    table.foreign("${colName}").references("${ref}").inTable("${fkTable}");`);
        }
    }

    function processProperties(props: { [key: string]: types.jsonSchemaPropsItem } | undefined, parentTable: string) {
        if (!props) return;
        const tbl = getOrCreateTable(parentTable);
        for (const key of Object.keys(props)) {
            const p = props[key];

            // explicit foreign key to another table -> keep as FK column in parent
            if (p && p["x-foreignKey"]) {
                addPrimitiveColumnToTable(tbl, key, p, parentTable);
                continue;
            }

            // Object/Array as JSON columns
            addPrimitiveColumnToTable(tbl, key, p, parentTable);
        }
    }

    processProperties(schema.properties, documentName);

    const outPath = `${options.outDir}/${documentName}Migration.gen.ts`;
    utils.common.writeFile("Knex",
        outPath,
        knexTemplate({
            documentName,
            tables,
            compilerOptions: options.compilerOptions,
        })
    );
}

export default {
    compile,
};

export async function compileMigrationsManifest(manifestPath: string, documents: Array<{ path: string; config: types.documentConfig; schema: types.jsonSchema }>): Promise<void> {
    try {
        const manifest: Array<{ filename: string; table: string; dependsOn: string[] }> = [];
        for (const doc of documents) {
            const deps: string[] = [];
            const props = (doc.schema && (doc.schema as any).properties) || {};
            Object.keys(props).forEach((key) => {
                const p: any = props[key];
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
    catch (e:any) {
        log.error("Failed to write migrations manifest", e);
    }
}
