import * as types from "./../types/types";

import utils from "./../utils";
import log from "./../utils/logger";


/**
 * - format the json schema file
 * - create role file (RBAC)
 * @param jsonSchemaPath
 * @param compilerOptions
 **/
export function formatJsonSchema(jsonSchemaPath: string, compilerOptions: types.compilerOptions): types.jsonSchema {
    // read json schema
    const fileName = jsonSchemaPath.split("/").pop()?.split(".")[0] || "Unknown_File_Name";
    
    const jsonSchema: types.jsonSchema = utils.jsonSchema.loadJsonSchema(jsonSchemaPath);

    // check documentConfig exist
    if (!jsonSchema["x-documentConfig"]) {
        log.error(`Json Schema Formatting: "${jsonSchemaPath}" x-documentConfig not found.`);
    }

    if (!jsonSchema["x-documentConfig"].documentName) {
        log.warn(`Json Schema Formatting: "${jsonSchemaPath}" x-documentConfig.documentName added.`);
        jsonSchema["x-documentConfig"].documentName = fileName;

    }

    if (!jsonSchema["x-documentConfig"].methods) {
        log.warn(`Json Schema Formatting: "${jsonSchemaPath}" x-documentConfig.methods not found, supported methods added.`);
        jsonSchema["x-documentConfig"].methods = Object.assign([], types.schemaMethodArr);
    }

    // check documentConfig format
    if (jsonSchema["x-documentConfig"].documentName != fileName) {
        log.error(`Json Schema Formatting: "${jsonSchemaPath}" x-documentConfig.documentName is not consistant with file name.`);
    }

    // json schema structure check 
    if (typeof jsonSchema.properties !== "object") {
        log.error(`properties is invalid in ${jsonSchemaPath}`);
    }

    // _id fields check
    if (compilerOptions.app.useObjectID){
        checkField_id(jsonSchema, jsonSchemaPath);
    }

    // format properties boolean "required" into array of string
    jsonSchema.required = getRequiredArrStr(jsonSchema, jsonSchemaPath);

    utils.common.writeFile("Json Schema Formatting", jsonSchemaPath, JSON.stringify(jsonSchema, null, 4));

    return jsonSchema;
}

/**
 * format the schema's required fields into array of string
 * @param schema
 * @param jsonSchemaPath
 **/
function getRequiredArrStr(schema: types.jsonSchemaPropsItem | types.jsonSchema, jsonSchemaPath?: string): string[] | undefined {
    let properties: { [key: string]: types.jsonSchemaPropsItem } | undefined ;
    let requiredArr: string[] = [];
    const isArrObj = (props: types.jsonSchemaPropsItem | types.jsonSchema) => Boolean(props.type == "array" && props.items && props.items.type == "object");
    
    if (isArrObj(schema)) {
        properties = schema.items.properties;
        requiredArr = typeof schema.items.required == "object" ? schema.items.required : [];
    }
    else if (schema.type == "object") {
        properties = schema.properties;
        requiredArr = typeof schema.required == "object" ? schema.required : [];
    }
    else {
        return undefined;
    }

    if (properties == undefined) {
        log.error(`formatJsonSchema > formatRequired : invalid "schema.properties" in ${jsonSchemaPath}`,schema);
    }
    else {
        Object.keys(properties).forEach((propKey: string) => {
            const prop: types.jsonSchemaPropsItem | undefined = properties?.[propKey];
            const keyNotInRequiredArr :boolean = !requiredArr.includes(propKey);

            // value
            if ( prop && prop.type !== "object" && prop.required === true && keyNotInRequiredArr) {
                requiredArr.push(propKey);
            }
            // array
            else if ( prop && prop.items && isArrObj(prop)) {
                prop.items.required = getRequiredArrStr(prop.items, jsonSchemaPath);
            }
            // object
            else if ( prop && prop.type == "object"){
                prop.required = getRequiredArrStr(prop, jsonSchemaPath);
                
                if ( prop.required && prop.required.length > 0  && keyNotInRequiredArr){
                    requiredArr.push(propKey);
                }
            }
        });
    }

    return requiredArr;
    
}

/**
 * check if _id field is not exist, add it
 * @param schema
 * @param jsonSchemaPath
 **/
function checkField_id(schema: types.jsonSchemaPropsItem | types.jsonSchema, jsonSchemaPath?: string){
    if (schema.properties && !schema.properties._id) {
        schema.properties._id = {
            type: "string",
            description: "Unique Identifier",
            example: "60c8c9d2b2b4f2c3e8d6f3e1",
        };
        log.info(`formatJsonSchema : "_id" field added to ${jsonSchemaPath}`);
    }
}