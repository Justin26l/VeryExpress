import * as types from "../types/types";

export function applyParentSchemasMetadata(documents: Array<{
    config: types.documentConfig;
    schema: types.jsonSchema;
}>): void {
    const schemaMap: { [key: string]: types.jsonSchema } = {};

    documents.forEach((document) => {
        document.schema.parentSchemas = {};
        schemaMap[document.config.documentName] = document.schema;
    });

    documents.forEach((document) => {
        scanForeignKeys(document.schema, (foreignKey) => {
            const parentSchema = schemaMap[foreignKey.schemaName];

            if (!parentSchema) {
                return;
            }

            const fieldName = lowerFirst(document.config.documentName);
            parentSchema.parentSchemas = parentSchema.parentSchemas || {};
            parentSchema.parentSchemas[fieldName] = {
                schemaName: document.config.documentName,
                fieldName,
                relationType: foreignKey.relationType,
            };
        });
    });
}

function scanForeignKeys(
    schema: types.jsonSchema | types.jsonSchemaPropsItem,
    onForeignKey: (foreignKey: types.foreignKeyConfig) => void,
): void {
    if (!schema.properties) {
        return;
    }

    Object.keys(schema.properties).forEach((key: string) => {
        const property = schema.properties?.[key];

        if (!property) {
            return;
        }

        const foreignKey = getForeignKey(property);

        if (foreignKey) {
            onForeignKey(foreignKey);
        }

        if (property.type === "object" && property.properties) {
            scanForeignKeys(property, onForeignKey);
        }
        else if (property.type === "array" && property.items?.type === "object") {
            scanForeignKeys(property.items, onForeignKey);
        }
    });
}

function getForeignKey(property: types.jsonSchemaPropsItem): types.foreignKeyConfig | undefined {
    const foreignKey = property["x-foreignKey"];

    if (foreignKey && typeof foreignKey === "object") {
        return {
            schemaName: foreignKey.schemaName,
            relationType: foreignKey.relationType,
        };
    }

    if (property.type === "array" && property.items) {
        const itemForeignKey = property.items["x-foreignKey"];

        if (itemForeignKey && typeof itemForeignKey === "object") {
            return {
                schemaName: itemForeignKey.schemaName,
                relationType: itemForeignKey.relationType,
            };
        }
    }

    return undefined;
}

function lowerFirst(value: string): string {
    return value.charAt(0).toLowerCase() + value.slice(1);
}