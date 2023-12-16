import fs from "fs";
import util from "util";
import jsYaml from "js-yaml";

import templates from "./templates";

import * as types from "./types/types";
import * as openapiType from "./types/openapi";

/**
 * compile openapi to controller source code
 * @param openapiPath 
 * @param outputPath 
 * @param options 
 */
export function compile(
    openapiPath: string, 
    controllerToModelPath: string, 
    outPath: string,
    options?: types.compilerOptions
) {

    const file = fs.readFileSync(openapiPath, 'utf8');
    const openApi: openapiType.openapi = jsYaml.load(file) as openapiType.openapi;
    const pathsValidator: {
        [key: string]: { // path
            [key: string]: string[] // method
        }
    } = {};

    // loop path
    Object.keys(openApi.paths).forEach((path: string) => {
        const interfaceName = openApi.paths[path].summary;
        pathsValidator[path] = {};

        console.log('\x1b[36m%s\x1b[0m', '[Processing]', ` - Controller Generator : ${path} -> ${interfaceName}`);

        // make validator
        Object.keys(openApi.paths[path]).forEach((method: string) => {
            // check method is in enum types.method
            if (!Object.values(types.method).includes(method as types.method)) return;
            let methodEnum: types.method = method as types.method;

            let validators: any[] = [];
            validators = buildParamValidator(path, methodEnum, openApi);
            validators = validators.concat(buildRequestBodyValidator(path, methodEnum, openApi));

            pathsValidator[path][method] = validators;
        });
    });

    let writtedPath :string[] = [];

    // create and write file
    Object.keys(openApi.paths).forEach((path: string) => {
        // remove '/{id}' from path and check is in writtedPath
        const pathWithoutId = path.replace('/{id}', '');
        if (writtedPath.includes(pathWithoutId)) return;
        else writtedPath.push(pathWithoutId);

        const interfaceName = openApi.paths[path].summary;

        fs.writeFileSync(outPath,
            templates.controllerTemplate({
                path: path,
                modelPath: controllerToModelPath,
                interfaceName: interfaceName,
                validator: pathsValidator,
                options: options,
            })
        );
    });

};

function buildParamValidator(
    path: string,
    method: types.method,
    openapi: openapiType.openapi,
): string[] {

    // {path : validator array}
    let validators: string[] = [];

    openapi.paths[path][method]!.parameters.forEach((parameter: openapiType.parameter) => {
        validators = validators.concat(processSchema(parameter.name, parameter, undefined));
    });

    return validators;
};

function buildRequestBodyValidator(
    path: string,
    method: types.method,
    openapi: openapiType.openapi,
): string[] {

    let validators: string[] = [];

    const referencePath: string | undefined = openapi.paths[path][method]?.requestBody?.content?.['application/json'].schema.$ref;
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