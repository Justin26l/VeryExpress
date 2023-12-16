import fs from "fs";
import util from "util";
import jsYaml from "js-yaml";
import { check, ValidationChain } from "express-validator";

import * as types from "./types/types";
import * as openapiType from "./types/openapi";

function compile(openapiPath: string, outputPath: string, options?: types.compilerOptions) {

    const file = fs.readFileSync(openapiPath, 'utf8');
    const openApi: openapiType.openapi = jsYaml.load(file) as openapiType.openapi;
    const pathsValidator: { 
        [key: string]: { // path
            [key: string]: ValidationChain[] // method
        } 
    } = {};

    // loop path
    Object.keys(openApi.paths).forEach((path: string) => {
        // loop method
        pathsValidator[path]={};

        Object.keys(openApi.paths[path]).forEach((method: string) => {
            // check method is in types.methodsArray
            if (!types.methodsArray.includes(method as types.method)) {
                throw new Error(`method [${method}] is not valid.`);
            };

            const validators = buildExpressValidator(path, method as types.method, openApi);
            
            pathsValidator[path][method] = validators;
        });
    });


    // console.dir(util.inspect(pathsValidator, { depth: null }), { depth: null });

};

function buildExpressValidator(
    path: string,
    method: types.method,
    openapi: openapiType.openapi,
): ValidationChain[] {

    // {path : validator array}
    let validators: ValidationChain[] = [];

    openapi.paths[path][method].parameters.forEach((parameter: openapiType.parameter) => {
        // validators.push(check(parameter).exists());
        const paramType = parameter.schema.type.toLowerCase();
        switch (paramType) {
            case "string":
                validators.push(check(parameter.name).isString());

                break;
            case "integer":
            case "float":
            case "number":
                validators.push(check(parameter.name).isNumeric());
                break;
            case "boolean":
                validators.push(check(parameter.name).isBoolean());
                break;
            // case "null":
            //     validators.push(check(parameter.name).isNull());
            //     break;
            case "array":
                validators.push(check(parameter.name).isArray());
                break;
            case "object":
                validators.push(check(parameter.name).isObject());
                break;
        }
    });

    return validators;

}

// function validatorMain (jsonSchema:{[key:string]:any}) :Object {

//     const validatorsArray : {[key:string]: Array<ValidationChain>} = {
//         create  : [],
//         read    : [],
//         update  : [],
//         delete  : [],
//     };
//     const documentConfig :documentConfig = jsonSchema['x-documentConfig'];
//     const properties = jsonSchema.properties;
//     const methodConfig = documentConfig.method;

//     // make validators array check as property type
//     if ( Object.keys(methodConfig).length > 0 ) {
//         methodConfig.create?.forEach((field:string) => {

//         });
//     }
// };

// export function json2Mongoose (
//     jsonSchema:{[key:string]:any}, 
//     interfacePath: string,
//     schemaFileName: string,
//     options?: compilerOptions
// ) {
//     if(!jsonSchema["x-documentConfig"]){
//         throw new Error("( jsonSchema.x-documentConfig : object ) is required");
//     };
//     const documentConfig = jsonSchema["x-documentConfig"];
//     const documentName = documentConfig.documentName;
//     const interfaceName = schemaFileName.at(0)?.toUpperCase() + schemaFileName?.slice(1);

//     // convert json to string
//     const schema = json2MongooseChunk(jsonSchema);
//     const schemaString  = util.inspect(schema, { depth: null });

//     // replace all '<<Type>>' with [Function:Type]
//     const mongooseSchema = schemaString.replace(/'<</g, "").replace(/>>'/g, "");

//     return template.modelsTemplate(interfacePath, interfaceName, documentName, mongooseSchema, options?.headerComment, options?.modelsTemplate);
// }

// export function compileFromFile(jsonSchemaPath:string, modelToInterfacePath:string, outputPath:string, options?:compilerOptions){
//     try{
//         const schemaFileName : string = ( jsonSchemaPath.split("/").pop() || jsonSchemaPath).replace(".json", "");

//         const jsonSchemaBuffer = fs.readFileSync(jsonSchemaPath);
//         const jsonSchema = JSON.parse(jsonSchemaBuffer.toString());
//         const mongooseSchema = json2Mongoose(jsonSchema, modelToInterfacePath, schemaFileName, options || utils.defaultCompilerOptions);
//         // console.log(mongooseSchema);

//         fs.writeFileSync(outputPath, mongooseSchema);
//     }
//     catch(err :any){
//         throw new Error(`Processing File [${jsonSchemaPath}] :\n ${(err.message || err)}`);
//     }
// }

compile("./output/openapi.yaml", "./test.ts")

// serve swagger ui