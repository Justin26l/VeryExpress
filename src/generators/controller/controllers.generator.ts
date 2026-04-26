
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
    compilerOptions: types.compilerOptions
}): Promise<void> {
    const schema = options.jsonSchema as types.jsonSchema;
    const schemaConfig = schema["x-documentConfig"];
    const controllerToModelBasePath: string = utils.common.relativePath(options.compilerOptions.sysDir, options.modelDir);
    const controllerToModelPath = `../${controllerToModelBasePath}/${schemaConfig.documentName}Model.gen`;
    const controllerToTypePath = `../_types/${schemaConfig.documentName}.gen`;
    const outPath = `${options.controllerOutDir}/${schemaConfig.documentName}Controller.gen.ts`;

    log.process(`Controller : ${schemaConfig.documentName}`);

    // Determine id type
    const idXFormat = options.jsonSchema.properties["_id"]?.["x-format"];
    const idType: "string" | "number" = (idXFormat === "PrimaryUUID" || idXFormat === "ObjectId") ? "string" : "number";

    // Build TsoaFieldDef[] from schema properties (exclude x-hidden fields from body)
    const fields: TsoaFieldDef[] = [];
    const hiddenFields: string[] = [];
    if (schema.type === "object") {
        for (const key of Object.keys(schema.properties ?? {})) {
            const p = schema.properties[key] as types.jsonSchemaPropsItem;
            if (p["x-hidden"]) {
                hiddenFields.push(key);
                continue;
            }
            fields.push({
                name: key,
                tsType: mapToTsType(p),
                required: schema.required?.includes(key) ?? false,
            });
        }
    }

    // Session is an internal document — skip tsoa @Route decorator
    const skipRoute = schemaConfig.documentName === "Session";

    utils.common.writeFile("Controller", outPath, controllerTemplate({
        modelPath: controllerToModelPath,
        typePath: controllerToTypePath,
        documentName: schemaConfig.documentName,
        methods: schemaConfig.methods,
        fields,
        hiddenFields,
        idType,
        skipRoute,
        compilerOptions: options.compilerOptions,
    }));
}

function mapToTsType(prop: types.jsonSchemaPropsItem): string {
    const fmt = prop["x-format"];
    if (fmt === "ObjectId" || fmt === "PrimaryUUID" || fmt === "PrimaryIncrements") return "string";
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