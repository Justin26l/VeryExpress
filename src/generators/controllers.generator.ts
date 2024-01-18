import fs from "fs";
import jsYaml from "js-yaml";

import controllerTemplate from "./controller.template";

import * as types from "../types/types";
import * as openapiType from "../types/openapi";
import log from "../utils/log";
import * as utils from "../utils/common";

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
    const controllerToModelBasePath: string = utils.relativePath(options.controllerOutDir, options.modelDir);

    const openApi: openapiType.openapi = jsYaml.load(file) as openapiType.openapi;
    const endpointsValidator: {
        [key: string]: { // path
            [key: string]: string[] // methods
        }
    } = {};
    const writtedEndpoint: string[] = [];

    // loop path
    Object.keys(openApi.paths).forEach((endpoint: string) => {
        // const interfaceName = openApi.paths[endpoint]['x-collection'];
        endpointsValidator[endpoint] = {};

        log.process(`Controller : ${options.compilerOptions.openapiDir} > ${endpoint}`);

        // make validator
        Object.keys(openApi.paths[endpoint]).forEach((method: string) => {
            // check method is in enum types.method
            if (!Object.values(types.method).includes(method as types.method)) return;
            const methodEnum: types.method = method as types.method;

            let validators: string[] = [];
            validators = buildParamValidator(endpoint, methodEnum, openApi);
            validators = validators.concat(buildRequestBodyValidator(endpoint, methodEnum, openApi));

            endpointsValidator[endpoint][method] = validators;
        });
    });

    // create and write file
    Object.keys(openApi.paths).forEach((endpoint: string) => {
        // remove '/{id}' from path and check is in writtedEndpoint
        const collectionName: string | undefined = openApi.paths[endpoint]["x-collection"];
        const interfaceName: string | undefined = openApi.paths[endpoint]["x-interface"];
        const endpointFormatted = endpoint.replace("/{id}", "").toLowerCase();

        if (collectionName === undefined) {
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
            const outPathNoGen = `${options.controllerOutDir}/${interfaceName}Controller.nogen.ts`;
            const controllerToModelPath = `${controllerToModelBasePath}/${interfaceName}Model.gen`;

            if (!fs.existsSync(outPathNoGen)) {
                log.writing(`Controller : ${outPath}`);
                writtedEndpoint.push(endpointFormatted);
                fs.writeFileSync(outPath,
                    controllerTemplate({
                        endpoint: endpoint,
                        modelPath: controllerToModelPath,
                        interfaceName: interfaceName,
                        validator: endpointsValidator,
                        compilerOptions: options.compilerOptions,
                    })
                );
            }
        }
    });

}

function buildParamValidator(
    endpoint: string,
    method: types.method,
    openapi: openapiType.openapi,
): string[] {

    let validators: string[] = [];

    openapi.paths[endpoint][method]!.parameters.forEach((parameter: openapiType.parameter) => {
        validators = validators.concat(processSchema({
            fieldName: parameter.name,
            required: parameter.required,
            param: parameter,
        }));
    });

    return validators;
}

function buildRequestBodyValidator(
    endpoint: string,
    method: types.method,
    openapi: openapiType.openapi,
): string[] {

    let validators: string[] = [];

    const referencePath: string | undefined = openapi.paths[endpoint][method]?.requestBody?.content?.["application/json"].schema.$ref;
    const reference: string | undefined = referencePath ? referencePath.split("/").pop() : undefined;
    const components: openapiType.componentsSchemaValue | undefined = reference ? openapi.components.schemas[reference] : undefined;

    if (components !== undefined) {
        for (const key in components.properties) {
            validators = validators.concat(processSchema({
                fieldName: key,
                required: components.required?.includes(key),
                body: components.properties[key],
            }));
        }
    }

    return validators;
}

function processSchema(options: {
    fieldName: string,
    required?: boolean,
    param?: openapiType.parameter,
    body?: openapiType.fieldsItem,
}): string[] {

    let validators: string[] = [];

    const useBody = options.body !== undefined && options.param == undefined;
    const required = options.required; // || options.param?.required;

    const type: string | undefined = useBody ? options.body?.type : options.param?.schema.type;
    const checkOn: string = useBody ? "body" : "check";

    const requiredValidator = required ? ".exists()" : ".optional()";
    const enumValidator: string =
        useBody && options.body?.enum ? `.isIn(${JSON.stringify(options.body.enum)})` :
            !useBody && options.param?.schema.enum ? `.isIn(${JSON.stringify(options.param.schema.enum)})` :
                "";
    const typeValidator: string = JSON.stringify({
        min: options.param?.schema?.minLength ?? options.param?.schema?.minimum ?? options.body?.minLength ?? options.body?.minimum,
        max: options.param?.schema?.maxLength ?? options.param?.schema?.maximum ?? options.body?.maxLength ?? options.body?.maximum,
    });

    switch (type) {
    case "string":
        validators.push(`${checkOn}("${options.fieldName}")${requiredValidator}.isString()${typeValidator !== undefined ? `.isLength(${typeValidator})` : ""}${enumValidator}`);
        break;
    case "integer":
        validators.push(`${checkOn}("${options.fieldName}")${requiredValidator}.isInt(${typeValidator})`);
        break;
    case "float":
        validators.push(`${checkOn}("${options.fieldName}")${requiredValidator}.isFloat(${typeValidator})`);
        break;
    case "number":
        validators.push(`${checkOn}("${options.fieldName}")${requiredValidator}.isNumeric()`);
        break;
    case "boolean":
        validators.push(`${checkOn}("${options.fieldName}")${requiredValidator}.isBoolean()`);
        break;
    case "array":
        validators.push(`${checkOn}("${options.fieldName}")${requiredValidator}.isArray(${typeValidator})`);
        break;
    case "object":
        if (useBody) {
            for (const key in options.body?.properties) {
                validators = validators.concat(processSchema({
                    fieldName: options.fieldName + "." + key,
                    body: options.body.properties[key],
                    required: required,
                }));
            }
        }
        break;
    }

    return validators;
}