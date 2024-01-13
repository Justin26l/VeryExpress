import fs from 'fs';
import * as types from '../types/types';
import * as common from '../utils/common';
import log from '../utils/log';

export function formatJsonSchema(jsonSchemaPath: string): types.jsonSchema {
    // read json schema
    let jsonSchema: types.jsonSchema = common.loadJsonSchema(jsonSchemaPath);
    if (jsonSchema == undefined) {
        log.error(`formatJsonSchema : error at loadJsonSchema()`);
    };

    // check props exist
    if (!jsonSchema['x-documentConfig']) {
        log.error(`formatJsonSchema : x-documentConfig not found in ${jsonSchemaPath}`);
    }
    else if (!jsonSchema['x-documentConfig'].documentName) {
        log.error(`formatJsonSchema : x-documentConfig.documentName not found in ${jsonSchemaPath}`);
    }
    else if (!jsonSchema['x-documentConfig'].interfaceName) {
        log.error(`formatJsonSchema : x-documentConfig.interfaceName not found in ${jsonSchemaPath}`);
    }
    else if (!jsonSchema['x-documentConfig'].methods || !Array.isArray(jsonSchema['x-documentConfig'].methods)) {
        log.error(`formatJsonSchema : x-documentConfig.methods is not found in ${jsonSchemaPath}`);
    };

    // format properties boolean "required" into array of string
    jsonSchema.required = getRequiredArrStr(jsonSchema, jsonSchemaPath);
    Object.keys(jsonSchema.properties).forEach((propKey: string) => {
        let prop: types.jsonSchemaPropsItem | undefined = jsonSchema.properties[propKey];
        prop.required = getRequiredArrStr(prop, jsonSchemaPath);
    });

    fs.writeFileSync(jsonSchemaPath, JSON.stringify(jsonSchema, null, 4));

    return jsonSchema;

}

function getRequiredArrStr(schema: types.jsonSchemaPropsItem | types.jsonSchema, jsonSchemaPath?: string): string[] | undefined {
    if (schema.type == 'object') {
        let oriRequiredArr: string[] = (typeof schema.required == 'object') ? schema.required : [];
        const properties: { [key: string]: types.jsonSchemaPropsItem } | undefined = schema.properties;

        if (properties == undefined) {
            log.error(`formatJsonSchema > formatRequired : invalid schema.properties format in ${jsonSchemaPath}`);
        }
        else {
            Object.keys(properties).forEach((propKey: string) => {
                let prop: types.jsonSchemaPropsItem | undefined = properties[propKey];
                if (prop.type !== 'object' && prop.required === true && !oriRequiredArr.includes(propKey)) {
                    oriRequiredArr.push(propKey);
                };
            });
        };
        return oriRequiredArr;
    }
    return;
}