import utils from "~/utils";
import * as types from "../types/types";

export function applyFkMetadata(documents: Array<{
    config: types.documentConfig;
    schema: types.jsonSchema;
}>): void {
    let schemaMap: { [key: string]: types.jsonSchema } = {};

    documents.forEach((document) => {
        document.schema.parentSchemas = {};
        schemaMap[document.config.documentName] = document.schema;
    });

    documents.forEach((doc) => {
        schemaMap = updateRelations(schemaMap, doc.schema, {} as types.compilerOptions);
    });
}

function updateRelations(jsonSchemaMap: { [key: string]: types.jsonSchema }, jsonSchema: types.jsonSchema, compilerOptions: types.compilerOptions): { [key: string]: types.jsonSchema } {

    Object.keys(jsonSchema.properties).forEach((key) => {
        const props = jsonSchema.properties[key];
        const fkConfig = props["x-foreignKey"];

        if (fkConfig) {
            const interfaceName = utils.common.pascalCase(jsonSchema["x-documentConfig"].documentName);
            const propsName = utils.common.camelCase(jsonSchema["x-documentConfig"].documentName);
            
            if (!jsonSchemaMap[fkConfig.schemaName].interface) {
                jsonSchemaMap[fkConfig.schemaName].interface = { fkProps: [] };
            }
            
            jsonSchemaMap[fkConfig.schemaName].interface?.fkProps.push({
                propName: propsName,
                interfaceName: interfaceName,
                relationType: fkConfig.relationType === types.DbRelationType.ManyToOne
                    ? types.DbRelationType.OneToMany
                    : types.DbRelationType.OneToOne,
            });
        }
    });
    return jsonSchemaMap;
}