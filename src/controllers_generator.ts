import fs from "fs";
import jsYaml from "js-yaml";
import { check, ValidationChain} from "express-validator";

import * as utils from "./utils";

import * as openapiType from "./types/openapi";
import { compilerOptions, documentConfig, method } from "./types/types";

function main (openapiPath:string, outputPath:string, options?:compilerOptions) {

    try {
        const file = fs.readFileSync(openapiPath, 'utf8');
        const data = jsYaml.load(file);

        console.dir(data, {depth: null});
    } catch (e) {
        console.error(e);
    }
}
function buildValidator(
    path:string, 
    method:method, 
    openapi:openapiType.openapi,
) :ValidationChain[] {

    // {path : validator array}
    let validators : ValidationChain[] = [];

    for (let parameter in openapi.paths[path][method].parameters) {
        validators.push(check(parameter).exists());
        switch (parameter.type.toLowerCase()) {
            case "string":
                validators.push(check(parameter).isString());
                break;
            case "integer":
            case "float":
            case "number":
                validators.push(check(parameter).isNumeric());
                break;
            case "boolean":
                validators.push(check(parameter).isBoolean());
                break;
            // case "null":
            //     validators.push(check(parameter).isNull());
            //     break;
            case "array":
                validators.push(check(parameter).isArray());
                break;
            case "object":
                validators.push(check(parameter).isObject());
                break;
        }
    });

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

main("./output/openapi.yaml", "./test.ts")