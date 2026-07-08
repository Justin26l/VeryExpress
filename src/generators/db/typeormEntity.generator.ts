import utils from "../../utils";
import log from "../../utils/logger";
import typeormEntityTemplate from "./typeormEntity.template";
import * as types from "../../types/types";
import * as typeormModel from "../../types/typeormModel";

function isEnum(props: types.jsonSchemaPropsItem): boolean {
    return props.enum !== undefined && Array.isArray(props.enum) && props.enum.every(v => typeof v === "string");
}

function jsonTypeToTs(prop: types.jsonSchemaPropsItem): string {
    switch (prop.type) {
    case "integer":
    case "number":  return "number";
    case "boolean": return "boolean";
    case "object":  return "Record<string, unknown>";
    case "array": {
        const itemType = (prop.items as types.jsonSchemaPropsItem | undefined)?.type;
        switch (itemType) {
        case "integer":
        case "number":  return "number[]";
        case "boolean": return "boolean[]";
        default:        return "string[]";
        }
    }
    default:        return "string";
    }
}

// ─── DB type resolution ───────────────────────────────────────────────────────

/** x-format values that map directly to a PostgreSQL column type */
const X_FORMAT_DB_TYPE: Record<string, string> = {
    Primary:       "uuid",
    PrimaryUUID:   "uuid",
    UUID:          "uuid",
    ObjectId:      "varchar",   // MongoDB ObjectId stored as varchar(24)
    UnixTimestamp: "bigint",    // epoch ms — needs bigint transformer
};

/** JSON Schema `format` hints that map to PostgreSQL column types */
const JSON_FORMAT_DB_TYPE: Record<string, string> = {
    "date":      "date",
    "date-time": "timestamp",
    "time":      "time",
    "email":     "varchar",    // varchar(254) per RFC 5321
    "uri":       "text",
    "uuid":      "uuid",
};

function resolveStringDbType(prop: types.jsonSchemaPropsItem): string {
    if (prop.format && JSON_FORMAT_DB_TYPE[prop.format]) return JSON_FORMAT_DB_TYPE[prop.format];
    return prop.maxLength ? "varchar" : "text";
}

function resolveDbType(prop: types.jsonSchemaPropsItem): string {
    if (isEnum(prop)) return "enum";
    const xFormat = prop["x-format"];
    if (xFormat && X_FORMAT_DB_TYPE[xFormat]) return X_FORMAT_DB_TYPE[xFormat];
    switch (prop.type) {
    case "string":  return resolveStringDbType(prop);
    case "integer": return "int";
    case "number":
    case "float":   return prop.precision ? "decimal" : "double precision";
    case "boolean": return "boolean";
    case "array":   return "text";      // isArray flag will set array:true on the column
    case "object":  return "jsonb";
    default:        return "varchar";
    }
}

/** varchar/char only — returns undefined for all other types */
function resolveColumnLength(prop: types.jsonSchemaPropsItem, dbType: string): number | undefined {
    if (!["varchar", "char"].includes(dbType)) return undefined;
    if (prop.maxLength)                         return prop.maxLength;
    if (prop.format === "email")                return 254;    // RFC 5321
    if (utils.jsonSchema.getXFormat(prop["x-format"]) === types.xFormatType.ObjectId)        return 24;     // MongoDB ObjectId hex length
    return undefined;
}

// ─── Per-column builder ───────────────────────────────────────────────────────

const NUMERIC_DB_TYPES = new Set(["int", "double precision", "decimal", "bigint"]);

function isNumericDbType(dbType: string): boolean {
    return NUMERIC_DB_TYPES.has(dbType);
}

function mapPropToColumnDef(
    key: string,
    prop: types.jsonSchemaPropsItem,
    requiredFields: string[],
    singleFieldUniques: Set<string>,
): typeormModel.ColumnDef {
    const isPrimary = [types.xFormatType.Primary, types.xFormatType.PrimaryUUID].includes(utils.jsonSchema.getXFormat(prop["x-format"]));
    const isenum    = isEnum(prop);
    const nullable  = !requiredFields.includes(key) && !isPrimary;
    const dbType    = resolveDbType(prop);

    const isNumeric = isNumericDbType(dbType);

    // SQL-level defaults for x-vexData timestamp fields
    const vexType = utils.jsonSchema.getXVexData(prop["x-vexData"]);
    const unixTsDefault = "EXTRACT(EPOCH FROM NOW())::bigint";
    const defaultRaw = vexType === types.xVexDataType.UnixTimestampOnCreate || vexType === types.xVexDataType.UnixTimestampOnUpdate
        ? unixTsDefault
        : undefined;
    const onUpdateRaw = vexType === types.xVexDataType.UnixTimestampOnUpdate
        ? unixTsDefault
        : undefined;

    return {
        name:    key,
        tsType:  isPrimary ? "string" : isenum ? utils.common.pascalCase(key) + "Enum" : jsonTypeToTs(prop),
        dbType,
        isPrimary,
        isGenerated: isPrimary || Boolean([types.xFormatType.UUID, types.xFormatType.UnixTimestamp].includes(utils.jsonSchema.getXFormat(prop["x-format"]))),
        isIndex:  prop.index === true,
        isUnique: singleFieldUniques.has(key),
        isNested: prop.type === "object" || prop.type === "array",
        isArray:  prop.type === "array",
        needsBigintTransformer: dbType === "bigint",
        unsigned: isNumeric && prop.minimum !== undefined && prop.minimum >= 0 ? true : undefined,
        nullable,
        comment:        prop.description,
        length:         resolveColumnLength(prop, dbType),
        precision:      prop.precision,
        scale:          prop.scale,
        enumValues:     isenum ? prop.enum : undefined,
        enumName:       isenum ? utils.common.pascalCase(key) + "Enum" : undefined,
        defaultValue:   prop.default,
        defaultRaw,
        onUpdateRaw,
    };
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
    const singleFieldUniques = new Set(
        uniqueIndexes.filter(idx => idx.length === 1).map(idx => idx[0])
    );
    const columns: typeormModel.ColumnDef[] = Object.keys(props).map(key => mapPropToColumnDef(key, props[key], requiredFields, singleFieldUniques));

    // ensure _id primary column exists
    if (!columns.find(c => c.isPrimary)) {
        columns.unshift({ name: "_id", tsType: "string", dbType: "uuid", isPrimary: true, isGenerated: true, nullable: false, isIndex: false, isNested: false, isArray: false });
    }   

    const localRelations = buildLocalRelations(props);
    const foreignRelations = buildForeignRelations(documentName, options.allSchemas);
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
            } satisfies typeormModel.ManyToOneRelation))
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
