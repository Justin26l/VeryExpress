import typeormEntityTemplate, { ManyToOneRelation, OneToManyRelation } from "./typeormEntity.template";
import utils from "../../utils";
import log from "../../utils/logger";
import * as types from "../../types/types";

function jsonTypeToTs(prop: types.jsonSchemaPropsItem): string {
    switch (prop.type) {
    case "integer":
    case "number":  return "number";
    case "boolean": return "boolean";
    case "array": {
        const itemType = (prop.items as types.jsonSchemaPropsItem | undefined)?.type;
        switch (itemType) {
        case "integer":
        case "number":  return "number[]";
        case "boolean": return "boolean[]";
        default:        return "string[]";
        }
    }
    case "object":  return "Record<string, unknown>";
    default:        return "string";
    }
}

function toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
}

function buildManyToOneRelations(props: Record<string, types.jsonSchemaPropsItem>): ManyToOneRelation[] {
    return (Object.keys(props) as string[])
        .filter(key => !!props[key]["x-foreignKey"])
        .map(key => {
            const fk = props[key]["x-foreignKey"]!;
            return {
                propertyName: toCamelCase(fk.schemaName),
                targetEntity: `${fk.schemaName}Entity`,
                importPath: `./${fk.schemaName}Model.gen`,
                joinColumnName: key,
                relationType: fk.relationType,
            };
        });
}

function buildOneToManyRelations(documentName: string, allSchemas: types.jsonSchema[]): OneToManyRelation[] {
    const relations: OneToManyRelation[] = [];
    for (const schema of allSchemas) {
        const otherDocName = schema["x-documentConfig"].documentName;
        if (otherDocName === documentName) continue;
        const otherProps = schema.properties || {};
        for (const key of Object.keys(otherProps)) {
            const p = otherProps[key] as types.jsonSchemaPropsItem;
            if (p["x-foreignKey"]?.schemaName === documentName) {
                const fk = p["x-foreignKey"]!;
                relations.push({
                    propertyName: `${toCamelCase(otherDocName)}`,
                    targetEntity: `${otherDocName}Entity`,
                    importPath: `./${otherDocName}Model.gen`,
                    inversePropertyName: toCamelCase(documentName),
                    relationType: fk.relationType,
                });
            }
        }
    }
    return relations;
}

/**
 * Compile JSON Schema → TypeORM entity source code
 */
export async function compile(options: {
    jsonSchema: types.jsonSchema,
    outDir: string,
    compilerOptions: types.compilerOptions,
    allSchemas?: types.jsonSchema[],
}): Promise<void> {
    const schema = options.jsonSchema as types.jsonSchema;
    const documentName = schema["x-documentConfig"].documentName;
    const tableName = documentName.toLowerCase();
    const requiredFields: string[] = Array.isArray(schema.required) ? schema.required : [];

    log.process(`TypeORM Entity : ${documentName}`);

    const props = schema.properties || {};
    const columns = Object.keys(props).map(key => {
        const p = props[key] as types.jsonSchemaPropsItem;
        const isUuidPrimary = key === "_id" && p["x-format"] === "PrimaryUUID";
        const isPrimary = isUuidPrimary || p["x-format"] === "PrimaryIncrements" || p["x-format"] === "Primary";
        const nullable = !requiredFields.includes(key) && !isPrimary;
        return {
            name: key,
            tsType: isUuidPrimary ? "string" : jsonTypeToTs(p),
            isPrimary,
            isUUID: isUuidPrimary,
            isGenerated: isPrimary,
            nullable,
            maxLength: p.maxLength,
            isArray: p.type === "array",
            isBigInt: p.type === "number",
            isObject: p.type === "object",
            hasIndex: p.index === true,
        };
    });

    // ensure _id primary column exists
    if (!columns.find(c => c.isPrimary)) {
        columns.unshift({ name: "_id", tsType: "string", isPrimary: true, isUUID: true, isGenerated: true, nullable: false, maxLength: undefined, isArray: false, isBigInt: false, isObject: false, hasIndex: false });
    }

    const manyToOneRelations = buildManyToOneRelations(props as Record<string, types.jsonSchemaPropsItem>);
    const oneToManyRelations = options.allSchemas
        ? buildOneToManyRelations(documentName, options.allSchemas)
        : [];

    const outPath = `${options.outDir}/${documentName}Model.gen.ts`;
    utils.common.writeFile("TypeORM Entity",
        outPath,
        typeormEntityTemplate({
            documentName,
            tableName,
            columns,
            manyToOneRelations,
            oneToManyRelations,
            compilerOptions: options.compilerOptions,
        })
    );
}

export default { compile };
