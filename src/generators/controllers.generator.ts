import fs from "fs";
import util from "util";
import jsYaml from "js-yaml";

import templates from "../templates";

import * as types from "../types/types";
import * as openapiType from "../types/openapi";
import log from "../utils/log";

/**
 * compile openapi to controller source code
 * @param openapiPath 
 * @param controllerToModelDir
 * @param outputPath 
 * @param options 
 */
export function compile(
    openapiPath: string, 
    controllerToModelDir: string, 
    outDir: string,
    options?: types.compilerOptions
): void {
    const file = fs.readFileSync(openapiPath, 'utf8');
    const openApi: openapiType.openapi = jsYaml.load(file) as openapiType.openapi;
    const endpointsValidator: {
        [key: string]: { // path
            [key: string]: string[] // methods
        }
    } = {};

    // loop path
    Object.keys(openApi.paths).forEach((endpoint: string) => {
        const interfaceName = openApi.paths[endpoint].summary;
        endpointsValidator[endpoint] = {};

        log.process(`Controller : ${endpoint} -> ${interfaceName}Controller`);

        // make validator
        Object.keys(openApi.paths[endpoint]).forEach((method: string) => {
            // check method is in enum types.method
            if (!Object.values(types.method).includes(method as types.method)) return;
            let methodEnum: types.method = method as types.method;

            let validators: any[] = [];
            validators = buildParamValidator(endpoint, methodEnum, openApi);
            validators = validators.concat(buildRequestBodyValidator(endpoint, methodEnum, openApi));

            endpointsValidator[endpoint][method] = validators;
        });
    });

    let writtedEndpoint :string[] = [];

    // create and write file
    Object.keys(openApi.paths).forEach((endpoint: string) => {
        // remove '/{id}' from path and check is in writtedEndpoint
        const interfaceName = openApi.paths[endpoint].summary;
        const endpointFormatted = endpoint.replace('/{id}', '').toLowerCase();
        
        if (writtedEndpoint.includes(endpointFormatted)) {
            return;
        }
        else {
            writtedEndpoint.push(endpointFormatted);
        };

        // write controller
        const outPath = `${outDir}/${interfaceName}Controller.gen.ts`;
        const controllerToModelPath = `${controllerToModelDir}/${interfaceName}Model.gen`;

        log.process(`Controller : ${outPath}`);

        fs.writeFileSync(outPath,
            templates.controllerTemplate({
                endpoint: endpoint,
                modelPath: controllerToModelPath,
                interfaceName: interfaceName,
                validator: endpointsValidator,
                options: options,
            })
        );
    });

};

function buildParamValidator(
    endpoint: string,
    method: types.method,
    openapi: openapiType.openapi,
): string[] {

    // {path : validator array}
    let validators: string[] = [];

    openapi.paths[endpoint][method]!.parameters.forEach((parameter: openapiType.parameter) => {
        validators = validators.concat(processSchema(parameter.name, parameter, undefined));
    });

    return validators;
};

function buildRequestBodyValidator(
    endpoint: string,
    method: types.method,
    openapi: openapiType.openapi,
): string[] {

    let validators: string[] = [];

    const referencePath: string | undefined = openapi.paths[endpoint][method]?.requestBody?.content?.['application/json'].schema.$ref;
    const reference: string | undefined = referencePath ? referencePath.split('/').pop() : undefined;
    const components: openapiType.componentsSchemaValue | undefined = reference ? openapi.components.schemas[reference] : undefined;

    if (components !== undefined) {
        for (let key in components.properties) {
            validators = validators.concat(processSchema(key, undefined, components.properties[key]));
        };
    }

    return validators;
}

function processSchema(fieldName: string, paramFields?: openapiType.parameter, bodyFields?: openapiType.fieldsItem): string[] {
    let validators: string[] = [];

    const useBody = bodyFields !== undefined && paramFields == undefined;
    const checkOn = useBody ? 'body' : 'check';
    const type: string | undefined = useBody ? bodyFields?.type : paramFields?.schema.type;
    const required = paramFields?.required ? '.exists()' : '.optional()';

    const enumValidator: string =
        useBody && bodyFields?.enum ? `.isIn(${JSON.stringify(bodyFields.enum)})` :
            !useBody && paramFields?.schema.enum ? `.isIn(${JSON.stringify(paramFields.schema.enum)})` :
                '';

    const typeValidatorOption: string = JSON.stringify(
        useBody && bodyFields ? {
            min: bodyFields.minLength || bodyFields.minimum,
            max: bodyFields.maxLength || bodyFields.maximum,
        } :
            !useBody && paramFields ? {
                min: paramFields.schema?.minLength || paramFields.schema?.minimum,
                max: paramFields.schema?.maxLength || paramFields.schema?.maximum,
            } :
                undefined
    );

    const typeValidator: string | undefined = typeValidatorOption !== '{}' ? typeValidatorOption : undefined;

    switch (type) {
        case "string":
            validators.push(`${checkOn}("${fieldName}")${required}.isString()${typeValidator !== undefined ? `.isLength(${typeValidator})` : ''}${enumValidator}`);
            break;
        case "integer":
            validators.push(`${checkOn}("${fieldName}")${required}.isInt(${typeValidator})`);
            break;
        case "float":
            validators.push(`${checkOn}("${fieldName}")${required}.isFloat(${typeValidator})`);
            break;
        case "number":
            validators.push(`${checkOn}("${fieldName}")${required}.isNumeric()`);
            break;
        case "boolean":
            validators.push(`${checkOn}("${fieldName}")${required}.isBoolean()`);
            break;
        case "array":
            validators.push(`${checkOn}("${fieldName}")${required}.isArray(${typeValidator})`);
            break;
        case "object":
            if (useBody) {
                for (let key in bodyFields?.properties) {
                    validators = validators.concat(processSchema(fieldName + '.' + key, undefined, bodyFields.properties[key]));
                };
            };
            break;
    };

    return validators;
};