import utils from "~/utils";
import * as types from "../types/types";

export function applyFkMetadata(documents: Array<{
    path: string;
    config: types.documentConfig;
    schema: types.jsonSchema;
}>): void {
    let schemaMap: { [key: string]: types.jsonSchema } = {};

    documents.forEach((document) => {
        document.schema.parentSchemas = {};
        schemaMap[document.config.documentName] = document.schema;
    });

    documents.forEach((doc) => {
        schemaMap = updateRelations(schemaMap, doc.schema);
    });

    // Auto-populate restApi.joinWhitelist with all relation names if not explicitly set, then write back to file
    documents.forEach((doc) => {
        if (doc.config.restApi.joinWhitelist == undefined) {
            const whitelist = collectAllRelationNames(doc.schema);
            doc.config.restApi.joinWhitelist = whitelist;
            doc.schema["x-documentConfig"].restApi.joinWhitelist = whitelist;
            writeApiJoinWhitelistToFile(doc.path, whitelist);
        }
    });
}

/**
 * Write computed restApi.joinWhitelist back into the JSON schema file on disk.
 * Preserves all other fields; only patches x-documentConfig.restApi.joinWhitelist.
 */
function writeApiJoinWhitelistToFile(schemaPath: string, whitelist: string[]): void {
    try {
        const schema = utils.jsonSchema.loadJsonSchema(schemaPath);
        schema["x-documentConfig"].restApi.joinWhitelist = whitelist;
        utils.common.writeFile("Json Schema restApi.joinWhitelist", schemaPath, JSON.stringify(schema, null, 4));
    }
    catch (err) {
        // non-fatal: runtime memory is already set; log but continue
        console.warn(`[warn] Failed to write restApi.joinWhitelist to ${schemaPath}:`, err);
    }
}

/**
 * Collect all direct relation property names for a schema.
 * - Local FK fields: camelCase(fk.schemaName)
 * - Reverse FK relations: camelCase(propName) from interface.fkProps
 */
function collectAllRelationNames(schema: types.jsonSchema): string[] {
    const names = new Set<string>();

    // local FK properties on this schema
    for (const prop of Object.values(schema.properties ?? {})) {
        const fk = (prop as types.jsonSchemaPropsItem)["x-foreignKey"];
        if (fk) {
            names.add(utils.common.camelCase(fk.schemaName));
        }
    }

    // reverse FK relations populated by applyFkMetadata
    for (const fkProp of schema.interface?.fkProps ?? []) {
        names.add(utils.common.camelCase(fkProp.propName));
    }

    return Array.from(names);
}

function updateRelations(jsonSchemaMap: { [key: string]: types.jsonSchema }, jsonSchema: types.jsonSchema): { [key: string]: types.jsonSchema } {

    Object.keys(jsonSchema.properties).forEach((key) => {
        const props = jsonSchema.properties[key];
        const fkConfig = props["x-foreignKey"];

        if (fkConfig) {
            const interfaceName = utils.common.pascalCase(jsonSchema["x-documentConfig"].documentName);
            const propsName = utils.common.camelCase(jsonSchema["x-documentConfig"].documentName);
            
            if (!jsonSchemaMap[fkConfig.schemaName]?.interface) {
                jsonSchemaMap[fkConfig.schemaName].interface = { fkProps: [] };
            }
            
            jsonSchemaMap[fkConfig.schemaName].interface?.fkProps.push({
                propName: propsName,
                interfaceName: interfaceName,
                relationType: fkConfig.relationType === types.DbRelationType.ManyToOne
                    ? types.DbRelationType.OneToMany
                    : types.DbRelationType.OneToOne,
                imports: [],
            });
        }
    });
    return jsonSchemaMap;
}