import utils from "../../utils";
import log from "../../utils/logger";
import * as types from "../../types/types";
import mongooseModelTemplate from "./mongooseModel.template";

function jsonTypeToMongoose(prop: types.jsonSchemaPropsItem): string {
    switch (prop.type) {
    case "integer":
    case "number":  return "Number";
    case "boolean": return "Boolean";
    case "array": {
        const itemType = (prop.items as types.jsonSchemaPropsItem | undefined)?.type;
        switch (itemType) {
        case "integer":
        case "number":  return "[Number]";
        case "boolean": return "[Boolean]";
        default:        return "[String]";
        }
    }
    case "object":  return "Map";
    default:        return "String";
    }
}

export async function compile(options: {
    jsonSchema: types.jsonSchema,
    outDir: string,
    compilerOptions: types.compilerOptions,
}): Promise<void> {
    const schema = options.jsonSchema;
    const documentName = schema["x-documentConfig"].documentName;
    const requiredFields: string[] = Array.isArray(schema.required) ? schema.required : [];

    log.process(`Mongoose Model : ${documentName}`);

    const props = schema.properties || {};
    const fields = Object.keys(props)
        .filter(key => key !== "_id")
        .map(key => {
            const p = props[key] as types.jsonSchemaPropsItem;
            return {
                name: key,
                mongooseType: jsonTypeToMongoose(p),
                required: requiredFields.includes(key),
                maxLength: p.maxLength,
            };
        });

    const outPath = `${options.outDir}/${documentName}Model.gen.ts`;
    utils.common.writeFile("Mongoose Model",
        outPath,
        mongooseModelTemplate({ documentName, fields })
    );
}

export default { compile };
