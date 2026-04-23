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

    checkDocumentConfig(jsonSchema, fileName, jsonSchemaPath);
    checkForeignKeyConfig(jsonSchema, jsonSchemaPath);

    // json schema structure check 
    if (typeof jsonSchema.properties !== "object") {
        log.error(`"properties" format is invalid in ${jsonSchemaPath}`);
    }

    // format properties boolean "required" into array of string
    jsonSchema.required = getRequiredArrStr(jsonSchema, jsonSchemaPath);

    // normalize x-format: ObjectId -> PrimaryUUID for SQL/TypeORM target
    const convertXFormat = (schemaItem: types.jsonSchemaPropsItem | types.jsonSchema | undefined) => {
        if (!schemaItem) return;
        if (schemaItem.type === "object" && (schemaItem as any).properties) {
            const props = (schemaItem as any).properties as { [key: string]: types.jsonSchemaPropsItem };
            for (const k of Object.keys(props)) {
                const p = props[k];
                if (!p) continue;
                if (p["x-format"] === "ObjectId") {
                    const isId = k === "_id";
                    p["x-format"] = isId ? "PrimaryUUID" : undefined;
                    p.type = "string";
                    log.warn("[JsonSchema]", `SQL target: ${isId ? "converted" : "removed"} x-format ObjectId ${isId ? "-> PrimaryUUID" : ""} for property "${k}" in ${jsonSchemaPath}`);
                }
                if (p && (p.type === "object" || (p.type === "array" && p.items))) {
                    convertXFormat(p);
                }
            }
        }
        else if (schemaItem.type === "array" && (schemaItem as any).items) {
            convertXFormat((schemaItem as any).items);
        }
    };
    convertXFormat(jsonSchema);

    // additional validation: warn if nested object/array contain unsupported metadata
    const problems: string[] = [];

    const hasForbiddenFlags = (prop?: types.jsonSchemaPropsItem): boolean => {
        if (!prop) return false;
        return Boolean(
            prop.index ||
                prop["x-foreignKey"] ||
                prop["x-vexData"] ||
                prop["x-vex-data"]
        );
    };

    const pushIfForbidden = (basePath: string, propName: string, prop?: types.jsonSchemaPropsItem, isArrayItem = false) => {
        if (hasForbiddenFlags(prop)) {
            problems.push(isArrayItem ? `${basePath}[].${propName}` : `${basePath}.${propName}`);
        }
    };

    const walk = (schemaItem: types.jsonSchemaPropsItem | types.jsonSchema, ctxPath: string) => {
        if (!schemaItem) return;

        // Handle object nodes with properties
        if (schemaItem.type === "object" && schemaItem.properties) {
            for (const k of Object.keys(schemaItem.properties)) {
                const p = schemaItem.properties[k];
                const pPath = ctxPath ? `${ctxPath}.${k}` : k;

                // nested object -> inspect its direct properties for forbidden flags
                if (p.type === "object") {
                    if (p.properties) {
                        for (const nn of Object.keys(p.properties)) {
                            pushIfForbidden(pPath, nn, p.properties[nn], false);
                        }
                    }
                    walk(p, pPath);
                }
                // array of objects -> inspect item properties
                else if (p.type === "array" && p.items && p.items.type === "object") {
                    if (p.items.properties) {
                        for (const nn of Object.keys(p.items.properties)) {
                            pushIfForbidden(pPath, nn, p.items.properties[nn], true);
                        }
                    }
                    walk(p.items, pPath + "[]");
                }
                // other types -> continue recursion in case deeper structures exist
                else {
                    walk(p, pPath);
                }
            }
        }

        // array root with object items
        else if (schemaItem.type === "array" && schemaItem.items) {
            walk(schemaItem.items, ctxPath + "[]");
        }
    };

    walk(jsonSchema, "");

    if (problems.length > 0) {
        problems.forEach((p) => {
            log.warn(`SQL target: ${jsonSchemaPath} nested object/array contains unsupported index/x-foreignKey/x-vex-data -> ${p}. Consider modelling as separate document/table.`);
        });
    }

    utils.common.writeFile("Json Schema Formatting", jsonSchemaPath, JSON.stringify(jsonSchema, null, 4));

    return jsonSchema;
}

function checkDocumentConfig(jsonSchema: types.jsonSchema, fileName: string, jsonSchemaPath?: string): void {
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
}

function checkForeignKeyConfig(schema: types.jsonSchema, jsonSchemaPath?: string): boolean {
    // loop through all properties and check if "x-foreignKey" exist and valid

    const isForeignKeyValid = (fkConfig: types.foreignKeyConfig) => fkConfig && typeof fkConfig === "object"
        && typeof fkConfig.schemaName === "string"
        && typeof fkConfig.fieldName === "string"
        && (fkConfig.relationType === types.DbRelationType.OneToOne || fkConfig.relationType === types.DbRelationType.OneToMany);

    for (const key in schema.properties) {
        const fkConfig = schema.properties[key]["x-foreignKey"];
        if (fkConfig && !isForeignKeyValid(fkConfig)) {
            log.error(`Json Schema Formatting: "${jsonSchemaPath}" x-foreignKey config is invalid on property "${key}".`);
        }
    }
    return true;
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