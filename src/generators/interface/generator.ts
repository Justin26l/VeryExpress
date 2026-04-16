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
    const relationInterfaces = Object.keys(jsonSchema.childSchemas || {});

    Object.keys(jsonSchema.properties).forEach((key: any) => {
        const props = jsonSchema.properties[key];
        const isArray = props.type === "array";

        if (props["x-foreignKey"] || isArray && props.items["x-foreignKey"]) {
            const item = props;
            const itemTypeString = isArray ? props.items.type+"[]" : item.type;
            const modelName = isArray ? props.items["x-foreignKey"] : props["x-foreignKey"];
            relationInterfaces.push(modelName);

            // replace be "key?: type" and "key: type"
            result = result.replace(
                `${key}?: ${itemTypeString}`,
                `${key}?: ${compilerOptions.dbType === "document" ? "ObjectId" : "string"} | ${modelName}`
            );
        }
        else if (props.type === "object") {
            result = updateRelations(result, props, compilerOptions);
        }
    });


    const imports: string[] = [];

    // if is dbtype is document, add import ObjectId & relationInterfaces
    if (compilerOptions.dbType === "document") {
        imports.push("import { ObjectId } from \"mongodb\";");
    }

    // add import for relations
    if (relationInterfaces.length > 0) {
        relationInterfaces.forEach(modelName => {
            imports.push(`import { ${modelName} } from "./${modelName}.gen";`);
        });
    }

    result = imports.join("\n") + "\n\n" + result;

    return result;
}