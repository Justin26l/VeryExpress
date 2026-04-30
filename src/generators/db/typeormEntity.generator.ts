import utils from "../../utils";
import log from "../../utils/logger";
import typeormEntityTemplate from "./typeormEntity.template";
import * as types from "../../types/types";
import * as typeormModel from "../../types/typeormModel";

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

function buildLocalRelations(props: Record<string, types.jsonSchemaPropsItem>): typeormModel.ManyToOneRelation[] {
    return (Object.keys(props) as string[])
        .filter(key => !!props[key]["x-foreignKey"])
        .map(key => {
            const fk = props[key]["x-foreignKey"]!;
            return {
                propertyName: utils.common.camelCase(fk.schemaName),
                targetType: fk.schemaName,
                targetEntity: `${fk.schemaName}Entity`,
                importPath: `./${fk.schemaName}Model.gen`,
                joinColumnName: key,
                relationType: fk.relationType,
            };
        });
}

function buildForeignRelations(documentName: string, allSchemas: types.jsonSchema[]): typeormModel.OneToManyRelation[] {
    const relations: typeormModel.OneToManyRelation[] = [];
    for (const schema of allSchemas) {
        const otherDocName = schema["x-documentConfig"].documentName;
        if (otherDocName === documentName) continue;
        const otherProps = schema.properties || {};
        for (const key of Object.keys(otherProps)) {
            const p = otherProps[key] as types.jsonSchemaPropsItem;
            if (p["x-foreignKey"]?.schemaName === documentName) {
                const fk = p["x-foreignKey"]!;
                const inverseRelationType = fk.relationType === types.DbRelationType.ManyToOne
                    ? types.DbRelationType.OneToMany
                    : types.DbRelationType.OneToOne;
                relations.push({
                    propertyName: `${utils.common.camelCase(otherDocName)}`,
                    targetType: otherDocName,
                    targetEntity: `${otherDocName}Entity`,
                    importPath: `./${otherDocName}Model.gen`,
                    inversePropertyName: utils.common.camelCase(fk.schemaName),
                    relationType: inverseRelationType,
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
    allSchemas: types.jsonSchema[],
}): Promise<void> {
    const schema = options.jsonSchema as types.jsonSchema;
    const documentName = schema["x-documentConfig"].documentName;
    const tableName = documentName.toLowerCase();
    const uniqueIndexes = schema["x-documentConfig"].uniqueIndex || [];
    const requiredFields: string[] = Array.isArray(schema.required) ? schema.required : [];

    log.process(`TypeORM Entity : ${documentName}`);

    const props = schema.properties || {};
    const columns: typeormModel.ColumnDef[] = Object.keys(props).map(key => {
        const p = props[key] as types.jsonSchemaPropsItem;
        const isPrimary = p["x-format"] === "Primary";
        const isEnum = p.enum !== undefined && Array.isArray(p.enum) && p.enum.every(v => typeof v === "string");
        const nullable = !requiredFields.includes(key) && !isPrimary;

        return {
            name: key,
            tsType: 
                isEnum ? utils.common.pascalCase(key)+'Enum' : 
                isPrimary ? "string" : 
                jsonTypeToTs(p),
            isPrimary,
            isGenerated: isPrimary,
            nullable,
            maxLength: p.maxLength,
            isArray: p.type === "array",
            isBigInt: p.type === "number",
            isObject: p.type === "object",
            isEnum,
            enumValues: isEnum ? (p.enum) : undefined,
            isIndex: p.index === true
        };
    });

    // ensure _id primary column exists
    if (!columns.find(c => c.isPrimary)) {
        columns.unshift({ name: "_id", tsType: "string", isPrimary: true, isUUID: true, isGenerated: true, nullable: false, maxLength: undefined, isArray: false, isBigInt: false, isObject: false, isEnum: false, enumValues: undefined, isIndex: false });
    }

    const localRelations = buildLocalRelations(props);
    const foreignRelations = buildForeignRelations(documentName, options.allSchemas)
    const manyToOneRelations = localRelations.filter(r => r.relationType === "many-to-one");
    const oneToManyRelations = foreignRelations.filter(r => r.relationType === "one-to-many");
    const oneToOneRelations = [
        ...localRelations.filter(r => r.relationType === 'one-to-one'),
        ...foreignRelations
            .filter(r => r.relationType === 'one-to-one')
            .map(r => ({
                propertyName: r.propertyName,
                targetEntity: r.targetEntity,
                targetType: r.targetType,
                importPath: r.importPath,
                inversePropertyName: r.inversePropertyName,
                relationType: r.relationType,
            } satisfies typeormModel.ManyToOneRelation)) // reuse same structure for one-to-one since TypeORM uses same decorator on both sides,
    ];

    const outPath = `${options.outDir}/${documentName}Model.gen.ts`;
    utils.common.writeFile("TypeORM Entity",
        outPath,
        typeormEntityTemplate({
            documentName,
            tableName,
            uniqueIndexes,
            columns,
            oneToOneRelations,
            manyToOneRelations,
            oneToManyRelations,
            compilerOptions: options.compilerOptions,
        })
    );
}

export default { compile };
