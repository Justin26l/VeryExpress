// read package.json and get version
import fs from "fs";
import * as types from "../types/types";
import log from "./logger";

export function loadJsonSchema(jsonSchemaPath: string) : types.jsonSchema | never {

    if(!fs.existsSync(jsonSchemaPath)){
        return log.error(`loadJsonSchema : File Not Found ${jsonSchemaPath}`);
    }

    try {
        return JSON.parse(fs.readFileSync(jsonSchemaPath, "utf8")) as types.jsonSchema;
    }
    catch (e: any) {
        return log.error("Error Load JsonSchema :\n", e.message || e, jsonSchemaPath);
    }
}

/** remove "x-" and additionalKeyArr from schemaObj 
 * @param schemaObj - json schema object
 * @param additionalKeyArr - array of string or object of string
 * additionalKeyArr can be array of string or an object of { "fieldName": "fieldType" }
 * 
 * @example cleanXcustomValue( jsonSchema, ["fieldName1", "fieldName2"]);
 * @example cleanXcustomValue( jsonSchema, { "fieldName1": "string", "fieldName2": "object" });
*/
export function cleanXcustomValue(
    schemaObj: { [key: string]: any },
    additionalKeyArr?: string[] | types.additionalKeyObj
): { [key: string]: any } {
    // clone obj but avoid Object.assign cuz it parsed "Array [ a, b ]" to "number index object { 0:a, 1:b }"
    const obj = JSON.parse(JSON.stringify(schemaObj));
    
    const isAddiArrStr: boolean = Array.isArray(additionalKeyArr);

    const addiArrStr: string[] = isAddiArrStr ? additionalKeyArr as string[] : [];
    const addiArrObj: types.additionalKeyObj = !isAddiArrStr ? additionalKeyArr as types.additionalKeyObj : {};

    // filtr out key start with 'x-' and additionalKeyArr recursively
    for (const key in obj) {
        if (key.startsWith("x-")) {
            delete obj[key];
        }
        // additionalKeyArr is array, filter with fields name only
        else if ( isAddiArrStr && addiArrStr.includes(key) ) {
            delete obj[key];
        }
        // additionalKeyArr is object, filter with type
        else if ( !isAddiArrStr && typeof addiArrObj[key] !== "undefined" && addiArrObj[key] == typeof obj[key]  ) {
            delete obj[key];
        }
        else if (typeof obj[key] === "object") {
            obj[key] = cleanXcustomValue(obj[key], additionalKeyArr);
        }
    }

    return obj;
}

/** filter "getList" which not a http method */
export function httpMethod(jsonSchemaMethod: string, documentName: string) : types.httpMethod {
    if (jsonSchemaMethod == "getList"){ 
        return "get";
    }
    else if (types.httpMethodArr.includes(jsonSchemaMethod as types.httpMethod)){
        return jsonSchemaMethod as types.httpMethod;
    }
    else{
        log.error(`httpMethod : invalid method "${jsonSchemaMethod}" in "${documentName}".`);
        process.exit(1);
    }
}

export default {
    cleanXcustomValue,
    httpMethod,
    loadJsonSchema,
};