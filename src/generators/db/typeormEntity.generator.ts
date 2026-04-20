import typeormEntityTemplate from "./typeormEntity.template";
import utils from "../../utils";
import log from "../../utils/logger";
import * as types from "../../types/types";

function jsonTypeToTs(type: string | undefined): string {
    switch (type) {
    case "integer":
    case "number":  return "number";
    case "boolean": return "boolean";
    case "array":
    case "object":  return "Record<string, unknown>";
    default:        return "string";
    }
}

/**
 * Compile JSON Schema → TypeORM entity source code
 */
export async function compile(options: {
    jsonSchema: types.jsonSchema,
    outDir: string,
    compilerOptions: types.compilerOptions,
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
            tsType: isUuidPrimary ? "string" : jsonTypeToTs(p.type),
            isPrimary,
            isUUID: isUuidPrimary,
            isGenerated: isPrimary,
            nullable,
            maxLength: p.maxLength,
        };
    });

    // ensure _id primary column exists
    if (!columns.find(c => c.isPrimary)) {
        columns.unshift({ name: "_id", tsType: "string", isPrimary: true, isUUID: true, isGenerated: true, nullable: false });
    }

    const outPath = `${options.outDir}/${documentName}Model.gen.ts`;
    utils.common.writeFile("TypeORM Entity",
        outPath,
        typeormEntityTemplate({
            documentName,
            tableName,
            columns,
            compilerOptions: options.compilerOptions,
        })
    );
}

export default { compile };
