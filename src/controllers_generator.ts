import * as util from "util";
import * as fs from "fs";
import template from "./template";
import utils from "./utils";
import { compilerOptions, documentConfig, method } from "./types/types";
import { check, ValidationChain} from "express-validator";

// function getValidator(
//     method:method, 
//     jsonSchema:documentConfig, 
//     properties:{[key:string]:{type:string}}
// ) :Array<ValidationChain> {

//     let validatorsObj : ValidationChain[] = [];
//     validatorsObj[method].push(check(field).exists());
//     switch (properties[field].type.toLowerCase()) {
//         case "string":
//             validatorsObj[method].push(check(field).isString());
//             break;
//         case "integer":
//         case "float":
//         case "number":
//             validatorsObj[method].push(check(field).isNumeric());
//             break;
//         case "boolean":
//             validatorsObj[method].push(check(field).isBoolean());
//             break;
//         // case "null":
//         //     validatorsObj[method].push(check(field).isNull());
//         //     break;
//         case "array":
//             validatorsObj[method].push(check(field).isArray());
//             break;
//         case "object":
//             validatorsObj[method].push(check(field).isObject());
//             break;
//     }
// }

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

export function json2Mongoose (
    jsonSchema:{[key:string]:any}, 
    interfacePath: string,
    schemaFileName: string,
    options?: compilerOptions
) {
    if(!jsonSchema["x-documentConfig"]){
        throw new Error("( jsonSchema.x-documentConfig : object ) is required");
    };
    const documentConfig = jsonSchema["x-documentConfig"];
    const documentName = documentConfig.documentName;
    const interfaceName = schemaFileName.at(0)?.toUpperCase() + schemaFileName?.slice(1);

    // convert json to string
    const schema = json2MongooseChunk(jsonSchema);
    const schemaString  = util.inspect(schema, { depth: null });
    
    // replace all '<<Type>>' with [Function:Type]
    const mongooseSchema = schemaString.replace(/'<</g, "").replace(/>>'/g, "");

    return template.modelsTemplate(interfacePath, interfaceName, documentName, mongooseSchema, options?.headerComment, options?.modelsTemplate);
}

export function compileFromFile(jsonSchemaPath:string, modelToInterfacePath:string, outputPath:string, options?:compilerOptions){
    try{
        const schemaFileName : string = ( jsonSchemaPath.split("/").pop() || jsonSchemaPath).replace(".json", "");
        
        const jsonSchemaBuffer = fs.readFileSync(jsonSchemaPath);
        const jsonSchema = JSON.parse(jsonSchemaBuffer.toString());
        const mongooseSchema = json2Mongoose(jsonSchema, modelToInterfacePath, schemaFileName, options || utils.defaultCompilerOptions);
        // console.log(mongooseSchema);

        fs.writeFileSync(outputPath, mongooseSchema);
    }
    catch(err :any){
        throw new Error(`Processing File [${jsonSchemaPath}] :\n ${(err.message || err)}`);
    }
}