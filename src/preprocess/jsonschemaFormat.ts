import fs from "fs";
import path from "path";

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
    // read json schema file    
    const jsonSchema: types.jsonSchema = utils.jsonSchema.loadJsonSchema(jsonSchemaPath);

    // json schema structure check 
    if (typeof jsonSchema.properties !== "object") {
        log.error(`"properties" format is invalid in ${jsonSchemaPath}`);
    }

    checkSchemaBasic(jsonSchema, jsonSchemaPath);
    checkDocumentConfig(jsonSchema, jsonSchemaPath);
    checkForeignKeyConfig(jsonSchema, jsonSchemaPath);
    checkXFormatType(jsonSchema, jsonSchemaPath);

    // format properties boolean "required" into array of string
    jsonSchema.required = getRequiredArrStr(jsonSchema, jsonSchemaPath);

    if (compilerOptions.dbType === "sql") normalizeSqlTarget(jsonSchema, jsonSchemaPath, compilerOptions);

    utils.common.writeFile("Json Schema Formatting", jsonSchemaPath, JSON.stringify(jsonSchema, null, 4));

    return jsonSchema;
}

function checkSchemaBasic(jsonSchema: types.jsonSchema, jsonSchemaPath?: string): void {
    if (jsonSchema.type !== "object" && jsonSchema.type !== "array") {
        log.error(`Json Schema Formatting: "${jsonSchemaPath}" root type must be "object" or "array".`);
    }
}

function checkDocumentConfig(jsonSchema: types.jsonSchema, jsonSchemaPath: string): void {
    const fileName = jsonSchemaPath.split("/").pop()?.split(".")[0] || "Unknown_File_Name";

    // check documentConfig exist
    if (!jsonSchema["x-documentConfig"]) {
        log.error(`Json Schema Formatting: "${jsonSchemaPath}" x-documentConfig not found.`);
    }

    // warns
    if (!jsonSchema["x-documentConfig"].documentName) {
        log.warn(`Json Schema Formatting: "${jsonSchemaPath}" x-documentConfig.documentName added.`);
        jsonSchema["x-documentConfig"].documentName = fileName;
    }

    if (!jsonSchema["x-documentConfig"].restApi) {
        log.warn(`Json Schema Formatting: "${jsonSchemaPath}" x-documentConfig.restApi not found, supported restApi.methods added.`);
        jsonSchema["x-documentConfig"].restApi = {
            methods: Object.assign([], types.schemaMethodArr),
        };
    }

    if (!jsonSchema["x-documentConfig"].restApi?.methods) {
        log.warn(`Json Schema Formatting: "${jsonSchemaPath}" x-documentConfig.restApi.methods not found, supported restApi.methods added.`);
        jsonSchema["x-documentConfig"].restApi.methods = Object.assign([], types.schemaMethodArr);
    }

    // check documentConfig format
    if (jsonSchema["x-documentConfig"].documentName != fileName) {
        log.error(`Json Schema Formatting: "${jsonSchemaPath}" x-documentConfig.documentName is not consistant with file name.`);
    }
}

function checkForeignKeyConfig(schema: types.jsonSchema, jsonSchemaPath: string): boolean {
    // Only owning-side relation types are valid in schema.
    // "one-to-many" is auto-derived by the generator from the other side's "many-to-one" definition.
    const validOwningTypes = [types.DbRelationType.OneToOne, types.DbRelationType.ManyToOne];

    const isForeignKeyValid = (fkConfig: types.foreignKeyConfig) => fkConfig && typeof fkConfig === "object"
        && typeof fkConfig.schemaName === "string"
        && typeof fkConfig.fieldName === "string"
        && validOwningTypes.includes(fkConfig.relationType);

    for (const key in schema.properties) {
        const fkConfig = schema.properties[key]["x-foreignKey"];
        if (!fkConfig) continue;

        if (fkConfig.relationType as string === 'many-to-many') {
            log.error(
                `Json Schema Formatting: "${jsonSchemaPath}" property "${key}" has foreignKey with relationType "many-to-many" is invalid. ` +
                `make a join table instead.`
            );
        }

        if (fkConfig.relationType === types.DbRelationType.OneToMany) {
            log.error(
                `Json Schema Formatting: "${jsonSchemaPath}" property "${key}" has foreignKey with relationType "one-to-many" is not allowed. ` +
                `Define "many-to-one" on the owning side instead; the inverse "one-to-many" is auto-generated.`
            );
        }
        else if (!isForeignKeyValid(fkConfig)) {
            log.error(`Json Schema Formatting: "${jsonSchemaPath}" x-foreignKey config is invalid on property "${key}".`);
        }
    }
    return true;
}

/** Valid JSON Schema types for each x-format value */
const X_FORMAT_VALID_TYPES: Record<string, string[]> = {
    [types.xFormatType.Primary]:       ["string"],
    [types.xFormatType.PrimaryUUID]:   ["string"],
    [types.xFormatType.UUID]:          ["string"],
    [types.xFormatType.ObjectId]:      ["string"],
    [types.xFormatType.UnixTimestamp]: ["integer"],
};

function checkXFormatType(schema: types.jsonSchema, jsonSchemaPath: string): void {
    const checkProps = (props: { [key: string]: types.jsonSchemaPropsItem }, contextPath: string) => {
        for (const key of Object.keys(props)) {
            const prop = props[key];
            const xFormat = prop["x-format"];

            if (xFormat && X_FORMAT_VALID_TYPES[xFormat]) {
                const valid = X_FORMAT_VALID_TYPES[xFormat];
                if (!valid.includes(prop.type)) {
                    log.error(
                        `Json Schema Formatting: "${jsonSchemaPath}" property "${contextPath}${key}" ` +
                        `has x-format "${xFormat}" but type is "${prop.type}" — expected: ${valid.join(" | ")}.`
                    );
                }
            }

            // recurse into nested objects / array items
            if (prop.type === "object" && prop.properties) {
                checkProps(prop.properties, `${contextPath}${key}.`);
            }
            else if (prop.type === "array" && prop.items?.type === "object" && prop.items.properties) {
                checkProps(prop.items.properties, `${contextPath}${key}[].`);
            }
        }
    };

    if (schema.properties) checkProps(schema.properties, "");
}


/**
 * SQL (PostgreSQL) target only.
 * Syncs role enum values from compilerOptions into UserRole.json's role field (x-vexData:"role").
 * Sets x-format:"PgEnum" so the TypeORM generator emits a native Postgres ENUM column.
 *
 * TODO (mongo): find schema with x-vexData:"role" prop across all schemas,
 *   set items.enum to compilerOptions.useRBAC.roles for Mongoose string enum validation.
 */
export function formatJsonSchemaRoleDefinition(options: {
    compilerOptions: types.compilerOptions
}): void {
    if (!options.compilerOptions.useRBAC) return;
    
    // TODO: mongodb support, check userschema with x-vexData:"role", set enum to compilerOptions.useRBAC.roles for mongoose schema validation. --- IGNORE ---
    if (options.compilerOptions.dbType !== "sql") return;

    const roles = options.compilerOptions.useRBAC.roles;
    const userRolePath = path.posix.join(options.compilerOptions.jsonSchemaDir, "UserRole.json");

    if (!fs.existsSync(userRolePath)) {
        log.warn(`Json Schema Formatting: UserRole.json not found at ${userRolePath}, skipping role enum sync.`);
        return;
    }

    const schema = utils.common.loadJson<types.jsonSchema>(userRolePath);

    for (const key in schema.properties) {
        const prop = schema.properties[key];
        if (prop["x-vexData"] === types.xVexDataType.Role && prop.enum !== roles) {
            prop.type = "string";
            prop.enum = roles;
            log.process(`Json Schema Formatting: update role definitions UserRole.${key} enum -> [${roles.join(", ")}]`);
            break;
        }
    }

    utils.common.writeFile("Role Schema Formatting", userRolePath, JSON.stringify(schema, null, 4));
}


/**
 * format the schema's required fields into array of string
 * @param schema
 * @param jsonSchemaPath
 **/
function getRequiredArrStr(schema: types.jsonSchemaPropsItem | types.jsonSchema, jsonSchemaPath: string): string[] | undefined {
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

function normalizeSqlTarget(jsonSchema: types.jsonSchema, jsonSchemaPath: string, compilerOptions: types.compilerOptions): void {

    // normalize x-format: ObjectId -> Primary for SQL/TypeORM target
    const normalizeConfig = (schemaItem: types.jsonSchemaPropsItem | types.jsonSchema | undefined) => {
        if (!schemaItem) return;
        if (schemaItem.type === "object" && (schemaItem as any).properties) {
            const props = (schemaItem as any).properties as { [key: string]: types.jsonSchemaPropsItem };
            for (const k of Object.keys(props)) {
                const p = props[k];
                if (!p) continue;
                if (p["x-format"] === types.xFormatType.ObjectId) {
                    const isId = k === "_id";
                    p["x-format"] = isId ? types.xFormatType.Primary : undefined;
                    p.type = "string";
                    log.warn("[JsonSchema]", `SQL target: ${isId ? "converted" : "removed"} x-format ObjectId ${isId ? "-> Primary" : ""} for property "${k}" in ${jsonSchemaPath}`);
                }
                if (p && (p.type === "object" || (p.type === "array" && p.items))) {
                    normalizeConfig(p);
                }
            }
        }
        else if (schemaItem.type === "array" && (schemaItem as any).items) {
            normalizeConfig((schemaItem as any).items);
        }
    };

    if (compilerOptions.dbType === "sql") normalizeConfig(jsonSchema);

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
}