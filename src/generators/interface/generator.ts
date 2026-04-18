import * as jsonToTypescript from "json-schema-to-typescript";
import log from "../../utils/logger";
import utils from "~/utils";
import * as types from "~/types/types";
// import { compilerOptions } from "../../types/types";
// import process from "process";

export async function compile(jsonSchema: jsonToTypescript.JSONSchema, outputPath: string, compilerOptions: types.compilerOptions): Promise<void> {
    const title = String(outputPath.split("/").pop()?.split(".")[0]);
    log.process(`Type : ${title} > ${outputPath}`); 
    const content = await jsonToTypescript
        .compile(jsonSchema, title, {
            $refOptions: {},
            additionalProperties: false, // TODO: default to empty schema (as per spec) instead
            bannerComment: "",
            // cwd: process.cwd(),
            declareExternallyReferenced: true,
            enableConstEnums: true,
            format: true,
            ignoreMinAndMaxItems: true,
            strictIndexSignatures: false,
            style: {
                bracketSpacing: false,
                printWidth: 120,
                semi: true,
                singleQuote: false,
                tabWidth: 4,
                trailingComma: "none",
                useTabs: false,
            },
            unreachableDefinitions: false,
            unknownAny: true,
        })
        .then((ts: string) => {
            const fkTs = updateRelations(ts, jsonSchema, compilerOptions);
            return fkTs;
        });

    utils.common.writeFile(title, outputPath, "// {{headerComment}}\n" + content);
    return;
}

/**
 * update foreign key types to "ObjectId | <Model>",
 * add import statements for ObjectId and Models.
 * @param interfaceString 
 * @param jsonSchema 
 * @returns 
 */
function updateRelations(interfaceString: string, jsonSchema: any, compilerOptions: types.compilerOptions): string {
    let result: string = interfaceString;
    const imports: string[] = [];
    let useObjectId = false;

    Object.keys(jsonSchema.properties).forEach((key: any) => {
        const props = jsonSchema.properties[key];
        const isArray = props.type === "array";
        const foreignKey = getForeignKeySchemaName(isArray ? props.items : props);

        if (foreignKey) {
            const item = props;
            const itemTypeString = isArray ? props.items.type+"[]" : item.type;
            const relationType = isArray
                ? `(${compilerOptions.dbType === "document" ? "ObjectId" : "string"} | ${foreignKey})[]`
                : `${compilerOptions.dbType === "document" ? "ObjectId" : "string"} | ${foreignKey}`;

            // replace be "key?: type" and "key: type"
            result = result.replace(
                `${key}?: ${itemTypeString}`,
                `${key}?: ${relationType}`
            );
            result = result.replace(
                `${key}: ${itemTypeString}`,
                `${key}: ${relationType}`
            );

            imports.push(`import { ${foreignKey} } from "./${foreignKey}.gen";`);
            useObjectId = useObjectId || compilerOptions.dbType === "document";
        }
        else if (props.type === "object") {
            result = updateRelations(result, props, compilerOptions);
        }
    });

    Object.keys(jsonSchema.parentSchemas || {}).forEach((key: string) => {
        const childSchema = jsonSchema.parentSchemas[key] as types.foreignKeyConfig;
        const interfaceName = childSchema.schemaName;
        const childType = childSchema.relationType === "one-to-many" ? `${interfaceName}[]` : interfaceName;

        imports.push(`import { ${interfaceName} } from "./${interfaceName}.gen";`);
        result = appendInterfaceProperty(result, `    ${key}?: ${childType};`);
    });

    if (useObjectId) {
        imports.push("import { ObjectId } from \"mongodb\";");
    }

    if (imports.length === 0) {
        return result;
    }

    result = Array.from(new Set(imports)).join("\n") + "\n\n" + result;

    return result;
}

function getForeignKeySchemaName(props: types.jsonSchemaPropsItem | undefined): string | undefined {
    if (!props) {
        return undefined;
    }

    const foreignKey = props["x-foreignKey"];

    if (foreignKey && typeof foreignKey === "object") {
        return foreignKey.schemaName;
    }

    return undefined;
}

function appendInterfaceProperty(interfaceString: string, propertyLine: string): string {
    if (interfaceString.indexOf(propertyLine) >= 0) {
        return interfaceString;
    }

    const closingIndex = interfaceString.lastIndexOf("}");

    if (closingIndex < 0) {
        return interfaceString;
    }

    return interfaceString.slice(0, closingIndex) + propertyLine + "\n" + interfaceString.slice(closingIndex);
}