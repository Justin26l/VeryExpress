import objectionTemplate from "./objection.template";
import utils from "../../utils";
import log from "../../utils/logger";
import * as types from "../../types/types";

/**
 * compile jsonschema to Objection model source code (Mongoose-like wrapper)
 * @param options
 */
export async function compile(options: {
    jsonSchema: types.jsonSchema,
    outDir: string,
    compilerOptions: types.compilerOptions,
}): Promise<void> {
    const schema = options.jsonSchema as types.jsonSchema;
    const documentName = schema["x-documentConfig"].documentName;

    log.process(`Objection Model : ${documentName}`);

    const jsonSchemaObj: any = {
        type: "object",
        required: Array.isArray(schema.required) ? schema.required : [],
        properties: {},
    };

    const props = schema.properties || {};
    for (const key of Object.keys(props)) {
        const p = props[key] as types.jsonSchemaPropsItem;
        const propDef: any = {};
        if (p.type) propDef.type = p.type;
        if (p.enum) propDef.enum = p.enum;
        if (p.maxLength) propDef.maxLength = p.maxLength;
        if (p.minimum !== undefined) propDef.minimum = p.minimum;
        if (p.maximum !== undefined) propDef.maximum = p.maximum;
        jsonSchemaObj.properties[key] = propDef;
    }

    const outPath = `${options.outDir}/${documentName}Model.gen.ts`;
    utils.common.writeFile("Objection Model",
        outPath,
        objectionTemplate({
            documentName,
            jsonSchemaString: JSON.stringify(jsonSchemaObj, null, 4),
            compilerOptions: options.compilerOptions,
        })
    );
}

export default { compile };
