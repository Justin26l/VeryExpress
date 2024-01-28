import fs from "fs";
import * as types from "../types/types";
import * as common from "../utils/common";
import log from "../utils/log";

export function formatJsonSchema(jsonSchemaPath: string): types.jsonSchema {
    // read json schema
    const jsonSchema: types.jsonSchema = common.loadJsonSchema(jsonSchemaPath);
    if (jsonSchema == undefined) {
        log.error("formatJsonSchema : error at loadJsonSchema()");
    }

    // check props exist
    if (!jsonSchema["x-documentConfig"]) {
        log.error(`formatJsonSchema : x-documentConfig not found in ${jsonSchemaPath}`);
    }
    else if (!jsonSchema["x-documentConfig"].documentName) {
        log.error(`formatJsonSchema : x-documentConfig.documentName not found in ${jsonSchemaPath}`);
    }
    else if (!jsonSchema["x-documentConfig"].interfaceName) {
        log.error(`formatJsonSchema : x-documentConfig.interfaceName not found in ${jsonSchemaPath}`);
    }
    else if (!jsonSchema["x-documentConfig"].methods) {
        log.error(`formatJsonSchema : x-documentConfig.methods is not found in ${jsonSchemaPath}`);
    }
    else if (typeof jsonSchema["x-documentConfig"].methods !== "object") {
        log.error(`formatJsonSchema : x-documentConfig.methods type "${typeof jsonSchema["x-documentConfig"].methods}" is invalid in ${jsonSchemaPath}`);
    }
    else if (Array.isArray(jsonSchema["x-documentConfig"].methods)) {
        jsonSchema["x-documentConfig"].methods = jsonSchema["x-documentConfig"].methods.reduce((obj:any, key:string) => {
            obj[key] = {};
            return obj;
        }, {});
    }

    // format properties boolean "required" into array of string
    jsonSchema.required = getRequiredArrStr(jsonSchema, jsonSchemaPath);

    fs.writeFileSync(jsonSchemaPath, JSON.stringify(jsonSchema, null, 4));

    return jsonSchema;
}

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