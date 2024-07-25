import fs from "fs";
import jsYaml from "js-yaml";

import controllerTemplate from "./controller.template";

import utils from "./../../utils";
import log from "./../../utils/logger";

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
export async function compile(options: {
    openapiFile: string,
    controllerOutDir: string,
    modelDir: string,
    compilerOptions: types.compilerOptions
}): Promise<void> {
    const file: string = fs.readFileSync(options.compilerOptions.openapiDir + "/" + options.openapiFile, "utf8");
    const controllerToModelBasePath: string = utils.common.relativePath(options.compilerOptions.sysDir, options.modelDir);

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
        const documentName: string | undefined = openApi.paths[endpoint]["x-documentName"];
        const endpointFormatted = endpoint.replace("/{id}", "").toLowerCase();

        if (documentName === undefined) {
            log.error(`"x-documentName" not found in openapi spec's path "${endpoint}"\n     - opanapi source: ${options.compilerOptions.openapiDir}`);
            return;
        }
        else if (writtedEndpoint.includes(endpointFormatted)) {
            return;
        }
        else {
            // write controller
            const outPath = `${options.controllerOutDir}/${documentName}Controller.gen.ts`;
            const controllerToModelPath = `../${controllerToModelBasePath}/${documentName}Model.gen`;

            utils.common.writeFile("Controller",
                outPath,
                controllerTemplate({
                    endpoint: endpoint,
                    modelPath: controllerToModelPath,
                    documentName: documentName,
                    validators: endpointsValidator,
                    compilerOptions: options.compilerOptions,
                })
            );
            writtedEndpoint.push(endpointFormatted);
        }
    });

    return;

}

function buildParamValidator(
    endpoint: string,
    httpMethod: types.httpMethod,
    openapi: openapiType.openapi,
): Schema {

    const validators: Schema = {};

    openapi.paths[endpoint][httpMethod]!.parameters.forEach((parameter: openapiType.parameter) => {
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

    // open api "param" is "request query" 
    // but express validator "query" is "request query"
    const inParam = options.param?.in == "path";
    const inQuery = options.param?.in == "param";
    const inBody = options.body;
    
    const validators: Schema = {
        [options.fieldName]: {
            in : inParam ? "params" : inQuery ? "query" : inBody ? "body" : [],
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

        // enum validator
        if(useEnum){
            validatorParam.isEmpty = false;
            validatorParam.isIn = {
                options: useEnum,
            };
        }

        // x-format validator
        switch(options?.param?.schema?.["x-format"]){
        case "ObjectId":
            if (typeof validatorParam.custom !== "object" || validatorParam.custom === null) {
                validatorParam.custom = {};
            }
            // @ts-expect-error - type hell
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