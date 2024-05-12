import fs from "fs";
import jsYaml from "js-yaml";

import controllerTemplate from "./controller.template";
import log from "./../../utils/logger";
import { relativePath, writeFile } from "./../../utils/common";

import * as types from "./../../types/types";
import * as openapiType from "./../../types/openapi";
import { Schema } from "express-validator";

/**
 * compile openapi to controller source code
 * @param controllerOutDir output directory
 * @param modelDir
 * @param openapiFile
 * @param options 
 */
export function compile(options: {
    openapiFile: string,
    controllerOutDir: string,
    modelDir: string,
    compilerOptions: types.compilerOptions
}): void {
    const file: string = fs.readFileSync(options.compilerOptions.openapiDir + "/" + options.openapiFile, "utf8");
    const controllerToModelBasePath: string = relativePath(options.compilerOptions.sysDir, options.modelDir);

    const openApi: openapiType.openapi = jsYaml.load(file) as openapiType.openapi;
    const endpointsValidator: {
        [key: string]: { // path
            [key: string]: Schema // methods
        }
    } = {};
    const writtedEndpoint: string[] = [];

    // loop path
    Object.keys(openApi.paths).forEach((endpoint: string) => {
        log.process(`Controller : ${options.compilerOptions.openapiDir} > ${endpoint}`);
        
        endpointsValidator[endpoint] = {};

        // make validator
        Object.keys(openApi.paths[endpoint]).forEach((httpMethod: string) => {
            
            // check method is in enum types.schemaMethod
            if (!Object.values(types.httpMethodArr).includes(httpMethod as types.httpMethod)) return;
            const methodEnum: types.httpMethod = httpMethod as types.httpMethod;

            const validators: Schema = Object.assign(
                buildParamValidator(endpoint, methodEnum, openApi),
                buildBodyValidator(endpoint, methodEnum, openApi)
            );

            endpointsValidator[endpoint][httpMethod] = validators;
        });
    });

    // create and write file
    Object.keys(openApi.paths).forEach((endpoint: string) => {
        // remove '/{id}' from path and check is in writtedEndpoint
        const documentName: string | undefined = openApi.paths[endpoint]["x-collection"];
        const interfaceName: string | undefined = openApi.paths[endpoint]["x-interface"];
        const endpointFormatted = endpoint.replace("/{id}", "").toLowerCase();

        if (documentName === undefined) {
            log.error(`"x-collection" not found in openapi spec's path "${endpoint}"\n     - opanapi source: ${options.compilerOptions.openapiDir}`);
            return;
        }
        else if (interfaceName === undefined) {
            log.error(`"x-interface" not found in openapi spec's path "${endpoint}"\n     - opanapi source: ${options.compilerOptions.openapiDir}`);
            return;
        }
        else if (writtedEndpoint.includes(endpointFormatted)) {
            return;
        }
        else {
            // write controller
            const outPath = `${options.controllerOutDir}/${interfaceName}Controller.gen.ts`;
            const controllerToModelPath = `../${controllerToModelBasePath}/${interfaceName}Model.gen`;

            writeFile("Controller",
                outPath,
                controllerTemplate({
                    endpoint: endpoint,
                    modelPath: controllerToModelPath,
                    interfaceName: interfaceName,
                    validators: endpointsValidator,
                    compilerOptions: options.compilerOptions,
                })
            );
            writtedEndpoint.push(endpointFormatted);
        }
    });

}

function buildParamValidator(
    endpoint: string,
    httpMethod: types.httpMethod,
    openapi: openapiType.openapi,
): Schema {

    const validators: Schema = {};

    openapi.paths[endpoint][httpMethod]!.parameters.forEach((parameter: openapiType.parameter) => {
        if( parameter.name === "_id") {
            return;
        }

        Object.assign(
            validators, 
            processSchema({
                fieldName: parameter.name,
                required: parameter.required,
                param: parameter,
            })
        );
    });

    return validators;
}

function buildBodyValidator(
    endpoint: string,
    httpMethod: types.httpMethod,
    openapi: openapiType.openapi,
): Schema {

    const validators: Schema = {};

    const referencePath: string | undefined = openapi.paths[endpoint][httpMethod]?.requestBody?.content?.["application/json"].schema.$ref;
    const reference: string | undefined = referencePath ? referencePath.split("/").pop() : undefined;
    const components: openapiType.componentsSchemaValue | undefined = reference ? openapi.components.schemas[reference] : undefined;

    if (components !== undefined) {
        for (const key in components.properties) {
            Object.assign(
                validators, 
                processSchema({
                    fieldName: key,
                    body: components.properties[key],
                    required: components.required?.includes(key) || components.properties[key].required,
                })
            );
        }
    }

    return validators;
}

function processSchema(options: {
    fieldName: string,
    required?: boolean,
    param?: openapiType.parameter,
    body?: openapiType.fieldsItem,
}): Schema {

    const validators: Schema = {
        [options.fieldName]: {
            in : options.param ? "params" : options.body ? "body" : [],
            optional : !options.required ? { options: { values: "falsy", checkFalsy: true} } : false,
            notEmpty : true,
        },
    };

    const validatorParam = validators[options.fieldName];

    const useBody = options.body !== undefined && options.param == undefined;
    const type: string | undefined = useBody ? options.body?.type : options.param?.schema.type;
    const useEnum = options.param?.schema?.enum ?? options.body?.enum;

    const range : {
        min: number | undefined;
        max: number | undefined;
    } = {
        min: options.param?.schema?.minLength ?? options.param?.schema?.minimum ?? options.body?.minLength ?? options.body?.minimum,
        max: options.param?.schema?.maxLength ?? options.param?.schema?.maximum ?? options.body?.maxLength ?? options.body?.maximum,
    };
    const rangeValidator : undefined | {
        options: {
            min: number | undefined;
            max: number | undefined;
        }
    }
    = range.min && range.max ? { options: range } : undefined;

    switch (type) {
    case "string":
        validatorParam.isString = true;
        if(range.min && range.max){
            validatorParam.isLength = { options: range };
        }
        if(useEnum){
            validatorParam.isEmpty = false;
            validatorParam.isIn = {
                options: useEnum,
            };
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