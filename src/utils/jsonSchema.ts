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

/** remove "x-" and removeKey from schemaObj 
 * @param schemaObj - json schema object
 * @param removeKey - array of string or object of { keyName: value type }
 * 
 * @example cleanXcustomValue( jsonSchema, ["fieldName1", "fieldName2"]);
 * @example cleanXcustomValue( jsonSchema, { "fieldName1": "string", "fieldName2": "object" });
*/
export function cleanXcustomValue(
    schemaObj: { [key: string]: any },
    removeKey?: string[] | types.removeKeyObj
): { [key: string]: any } {
    // clone obj but avoid Object.assign cuz it parsed "Array [ a, b ]" to "number index object { 0:a, 1:b }"
    const obj = JSON.parse(JSON.stringify(schemaObj));
    
    const isAddiArrStr: boolean = Array.isArray(removeKey);

    const addiArrStr: string[] = isAddiArrStr ? removeKey as string[] : [];
    const addiArrObj: types.removeKeyObj = !isAddiArrStr ? removeKey as types.removeKeyObj : {};

    // filtr out key start with 'x-' and removeKey recursively
    for (const key in obj) {
        if (key.startsWith("x-")) {
            delete obj[key];
        }
        // removeKey is array, filter with fields name only
        else if ( isAddiArrStr && addiArrStr.includes(key) ) {
            delete obj[key];
        }
        // removeKey is object, filter with type
        else if ( !isAddiArrStr && typeof addiArrObj[key] !== "undefined" && addiArrObj[key] == typeof obj[key]  ) {
            delete obj[key];
        }
        else if (typeof obj[key] === "object") {
            obj[key] = cleanXcustomValue(obj[key], removeKey);
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