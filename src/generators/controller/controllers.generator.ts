
import controllerTemplate from "./controller.template";

import utils from "./../../utils";
import log from "./../../utils/logger";

import * as types from "./../../types/types";
import * as openapiType from "./../../types/openapi";

/** Zod chain descriptor per field */
export type ZodFieldDef = {
    in: "body" | "params" | "query";
    chain: string;  // e.g. "z.string().min(1)"
    required: boolean;
};

export type ZodSchemaDef = Record<string, ZodFieldDef>;


/**
 * compile jsonschema to controller source code
 * @param controllerOutDir output directory
 * @param modelDir
 * @param options 
 */
export async function compile(options: {
    jsonSchema: types.jsonSchema,
    controllerOutDir: string,
    modelDir: string,
    compilerOptions: types.compilerOptions
}): Promise<void> {
    const schema = options.jsonSchema as types.jsonSchema;
    const schemaConfig = schema["x-documentConfig"];
    const endpoint = (`/${schemaConfig.documentName}`).toLowerCase();
    const controllerToModelBasePath: string = utils.common.relativePath(options.compilerOptions.sysDir, options.modelDir);
    const endpointsValidator: {
        [key: string]: { // path
            [key: string]: ZodSchemaDef // methods
        }
    } = {};

    // UUID primary key — id path param is a string
    const idXFormat = options.jsonSchema.properties["_id"]?.["x-format"];
    const idType = idXFormat === "PrimaryUUID" ? "string" : "integer";
    const idValidators: ZodSchemaDef = processSchema({ fieldName: "id", required: true, param: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: idType, ["x-format"]: idXFormat || undefined  } as any,
    }});

    log.process(`Controller : ${schemaConfig.documentName} > ${endpoint}`);

    // Build endpointsValidator paths
    // /endpoint : "post" | 
    // /endpoint/{id} : "get" | "put" | "patch" | "delete"
    // /endpoint/search "getList";
    // build body validators for create/replace/update from schema properties
    const bodyValidators: ZodSchemaDef = {};
    if (schema && schema.type === "object") {
        for (const key in schema.properties) {
            Object.assign(
                bodyValidators,
                processSchema({
                    fieldName: key,
                    body: schema.properties[key],
                    required: schema.required?.includes(key) || (typeof schema.properties[key].required == "object" ? schema.properties[key].required.includes(key) : Boolean(schema.properties[key].required)),
                })
            );
        }
    }

    // assign validators for routes
    endpointsValidator[endpoint] = {};
    endpointsValidator[endpoint + "/{id}"] = {};
    endpointsValidator[endpoint + "/search"] = {};
    if (schemaConfig.methods.includes("get")) endpointsValidator[endpoint + "/{id}"].get = idValidators;
    if (schemaConfig.methods.includes("put")) endpointsValidator[endpoint + "/{id}"].put = Object.assign({}, idValidators, bodyValidators);
    if (schemaConfig.methods.includes("patch")) endpointsValidator[endpoint + "/{id}"].patch = Object.assign({}, idValidators, bodyValidators); 
    if (schemaConfig.methods.includes("delete")) endpointsValidator[endpoint + "/{id}"].delete = idValidators;
    if (schemaConfig.methods.includes("post")) endpointsValidator[endpoint].post = bodyValidators; // body validator will be assigned later after processing schema properties
    if (schemaConfig.methods.includes("getList")) endpointsValidator[endpoint + "/search"].post = {}; // no validator for getList (can be extended in the future)

    // const foreignKeysOptions: types.populateOptions = buildForeinKeyOptions(schema as types.jsonSchemaPropsItem);
    const outPath = `${options.controllerOutDir}/${schemaConfig.documentName}Controller.gen.ts`;
    const controllerToModelPath = `../${controllerToModelBasePath}/${schemaConfig.documentName}Model.gen`;
    
    utils.common.writeFile("Controller",
        outPath,
        controllerTemplate({
            endpoint: endpoint,
            modelPath: controllerToModelPath,
            documentName: schemaConfig.documentName,
            validators: endpointsValidator,
            compilerOptions: options.compilerOptions,
        })
    );
}

// function buildForeinKeyOptions(
//     schema: types.jsonSchemaPropsItem,
// ): types.populateOptions {
//     if(schema.type !== "object") {
//         throw new Error("buildForeinKeyOptions : root schema type must be object");
//     }

//     let foreignKeys: types.populateOptions = {};
//     const props = schema.properties || {};

//     for (const key in props) {
//         if (props[key]["x-foreignKey"]) {
//             foreignKeys[key] = props[key]["x-foreignValue"]?.join(" ") || "";
//         }
//         else if (props[key].type === "array" && props[key].items?.["x-foreignKey"]) {
//             foreignKeys[key] = props[key].items["x-foreignValue"]?.join(" ") || "";
//         }
//         else if (props[key].type === "object") {
//             foreignKeys = Object.assign(foreignKeys, buildForeinKeyOptions(props[key]));
//         }
//     }

//     return foreignKeys;
// }

export function processSchema(options: {
    fieldName: string,
    required?: boolean,
    param?: openapiType.parameter,
    body?: openapiType.fieldsItem,
}): ZodSchemaDef {

    const inParam = options.param?.in == "path";
    const inQuery = options.param?.in == "query";
    const inBody = options.body !== undefined && options.param === undefined;
    const location: ZodFieldDef["in"] = inParam ? "params" : inQuery ? "query" : "body";

    const useBody = inBody;
    const type: string | undefined = useBody ? options.body?.type : options.param?.schema.type;
    const useEnum = options.param?.schema?.enum ?? options.body?.enum;

    const range = {
        min: options.param?.schema?.minLength ?? options.param?.schema?.minimum ?? options.body?.minLength ?? options.body?.minimum,
        max: options.param?.schema?.maxLength ?? options.param?.schema?.maximum ?? options.body?.maxLength ?? options.body?.maximum,
    };

    const result: ZodSchemaDef = {};

    let chain = "";

    switch (type) {
    case "string":
        chain = "z.string()";
        if (range.min !== undefined) chain += `.min(${range.min})`;
        if (range.max !== undefined) chain += `.max(${range.max})`;
        if (useEnum) chain = `z.enum(${JSON.stringify(useEnum)})`;
        // x-format
        switch (options?.param?.schema?.["x-format"]) {
        case "ObjectId":
            chain += ".regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId')";
            break;
        case "PrimaryUUID":
            chain += ".uuid()";
            break;
        }
        break;
    case "integer":
        chain = "z.number().int()";
        if (range.min !== undefined) chain += `.min(${range.min})`;
        if (range.max !== undefined) chain += `.max(${range.max})`;
        break;
    case "float":
    case "number":
        chain = "z.number()";
        if (range.min !== undefined) chain += `.min(${range.min})`;
        if (range.max !== undefined) chain += `.max(${range.max})`;
        break;
    case "boolean":
        chain = "z.boolean()";
        break;
    case "array":
        chain = "z.array(z.unknown())";
        break;
    case "object":
        if (useBody && options.body?.properties) {
            for (const key in options.body.properties) {
                Object.assign(
                    result,
                    processSchema({
                        fieldName: options.fieldName + "." + key,
                        body: options.body.properties[key],
                        required: Array.isArray(options.body.required) ? options.body.required.includes(key) : false,
                    })
                );
            }
            return result;
        }
        chain = "z.record(z.unknown())";
        break;
    default:
        chain = "z.unknown()";
    }

    if (!options.required) chain += ".optional()";

    result[options.fieldName] = { in: location, chain, required: !!options.required };
    return result;
}