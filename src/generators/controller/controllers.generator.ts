
import controllerTemplate from "./controller.template";

import utils from "./../../utils";
import log from "./../../utils/logger";

import * as types from "./../../types/types";
import * as openapiType from "./../../types/openapi";
import { Schema } from "express-validator";

// id validator
const idValidators: Schema = processSchema({ fieldName: "id", required: true, param: {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string", ["x-format"]: "ObjectId" } as any,
}});

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
            [key: string]: Schema // methods
        }
    } = {};

    log.process(`Controller : ${schemaConfig.documentName} > ${endpoint}`);

    // Build endpointsValidator paths
    // /endpoint : "post" | 
    // /endpoint/{id} : "get" | "put" | "patch" | "delete"
    // /endpoint/search "getList";
    // build body validators for create/replace/update from schema properties
    const bodyValidators: Schema = {};
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

function processSchema(options: {
    fieldName: string,
    required?: boolean,
    param?: openapiType.parameter,
    body?: openapiType.fieldsItem,
}): Schema {

    // open api "param" is "request query" 
    // but express validator "query" is "request query"
    const inParam = options.param?.in == "path";
    const inQuery = options.param?.in == "query";
    const inBody = options.body;

    const validators: Schema = {
        [options.fieldName]: {
            in: inParam ? "params" : inQuery ? "query" : inBody ? "body" : [],
            optional: !options.required ? { options: { values: "falsy", checkFalsy: true } } : false,
            notEmpty: true,
        },
    };

    const validatorParam = validators[options.fieldName];

    const useBody = options.body !== undefined && options.param == undefined;
    const type: string | undefined = useBody ? options.body?.type : options.param?.schema.type;
    const useEnum = options.param?.schema?.enum ?? options.body?.enum;

    const range: {
        min: number | undefined;
        max: number | undefined;
    } = {
        min: options.param?.schema?.minLength ?? options.param?.schema?.minimum ?? options.body?.minLength ?? options.body?.minimum,
        max: options.param?.schema?.maxLength ?? options.param?.schema?.maximum ?? options.body?.maxLength ?? options.body?.maximum,
    };
    const rangeValidator: undefined | {
        options: {
            min: number | undefined;
            max: number | undefined;
        }
    }
        = range.min && range.max ? { options: range } : undefined;

    switch (type) {
    case "string":
        validatorParam.isString = true;
        if (range.min && range.max) {
            validatorParam.isLength = { options: range };
        }

        // enum validator
        if (useEnum) {
            validatorParam.isEmpty = false;
            validatorParam.isIn = {
                options: useEnum,
            };
        }

        // x-format validator
        switch (options?.param?.schema?.["x-format"]) {
        case "ObjectId":
            if (typeof validatorParam.custom !== "object" || validatorParam.custom === null) {
                validatorParam.custom = {};
            }
            validatorParam.custom.options = "FUNC{{this.isObjectId}}";
            // call controller base class : _ControllerFactory.isObjectId()
            break;
        }
        break;
    case "integer":
        validatorParam.isInt = rangeValidator;
        break;
    case "float":
        validatorParam.isFloat = rangeValidator;
        break;
    case "number":
        validatorParam.isNumeric = true;
        break;
    case "boolean":
        validatorParam.isBoolean = true;
        break;
    case "array":
        validatorParam.isArray = true;
        break;
    case "object":
        if (useBody) {
            for (const key in options.body?.properties) {
                Object.assign(
                    validators,
                    processSchema({
                        fieldName: options.fieldName + "." + key,
                        body: options.body.properties[key],
                        required: options.body.required?.includes(key),
                    })
                );
            }
        }
        break;
    }

    return validators;
}