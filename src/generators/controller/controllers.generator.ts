
import controllerTemplate, { TsoaFieldDef } from "./controller.template";

import utils from "./../../utils";
import log from "./../../utils/logger";

import * as types from "./../../types/types";


/**
 * compile jsonschema to tsoa-decorated controller source code
 */
export async function compile(options: {
    jsonSchema: types.jsonSchema,
    controllerOutDir: string,
    modelDir: string,
    compilerOptions: types.compilerOptions,
    allSchemas?: types.jsonSchema[],
}): Promise<void> {
    const schema = options.jsonSchema as types.jsonSchema;
    const schemaConfig = schema["x-documentConfig"];
    const controllerToModelBasePath: string = utils.common.relativePath(options.compilerOptions.sysDir, options.modelDir);
    const controllerToModelPath = `../${controllerToModelBasePath}/${schemaConfig.documentName}Model.gen`;
    const controllerToTypePath = `../_types/${schemaConfig.documentName}.gen`;
    const outPath = `${options.controllerOutDir}/${schemaConfig.documentName}Controller.gen.ts`;

    if (!schemaConfig.restApi.methods || schemaConfig.restApi.methods.length == 0) return;

    log.process(`Controller : ${schemaConfig.documentName}`);

    // Determine id type
    const idProps = options.jsonSchema.properties["_id"]
    const idXFormat = utils.jsonSchema.getXFormat(idProps?.["x-format"]);
    const idType = [types.xFormatType.Primary, types.xFormatType.ObjectId].includes(idXFormat as types.xFormatType) ? "string" : idProps?.type;

    // Session is an internal document — skip tsoa @Route decorator
    // Build TsoaFieldDef[] from schema properties
    const fields: TsoaFieldDef[] = [];
    if (schema.type === "object") {
        for (const [key, prop] of Object.entries(schema.properties ?? {})) {
            fields.push({
                name: key,
                tsType: mapToTsType(prop as types.jsonSchemaPropsItem),
                required: schema.required?.includes(key) ?? false,
            });
        }
    }

    utils.common.writeFile("Controller", outPath, controllerTemplate({
        modelPath: controllerToModelPath,
        typePath: controllerToTypePath,
        documentName: schemaConfig.documentName,
        fields,
        idType,
        restApiMethods: schemaConfig.restApi.methods,
        restApiJoinWhitelist: schemaConfig.restApi.joinWhitelist !== undefined,
        restApiNoRelations: Boolean(schemaConfig.restApi.noRelations),
        compilerOptions: options.compilerOptions,
        dataIsolation: schemaConfig.dataIsolation,
    }));
}

function mapToTsType(prop: types.jsonSchemaPropsItem): string {
    const fmt = utils.jsonSchema.getXFormat(prop["x-format"]);
    if (fmt === types.xFormatType.ObjectId || fmt === types.xFormatType.Primary) return "string";
    switch (prop.type) {
    case "string":  return "string";
    case "integer":
    case "number":
    case "float":   return "number";
    case "boolean": return "boolean";
    case "array":   return "unknown[]";
    case "object":  return "Record<string, unknown>";
    default:        return "unknown";
    }
}