import * as jsonToTypescript from "json-schema-to-typescript";
import log from "../../utils/logger";
import { compilerOptions } from "../../types/types";
import process from "process";

export async function compile(jsonSchema: jsonToTypescript.JSONSchema, outputPath: string, options?: compilerOptions) {
    const title = String(outputPath.split("/").pop()?.split(".")[0]);
    log.process(`Type : ${title} > ${outputPath}`);

    return await jsonToTypescript
        .compile(jsonSchema, title, {
            $refOptions: {},
            additionalProperties: false, // TODO: default to empty schema (as per spec) instead
            bannerComment: "{{headerComment}}\n",
            cwd: process.cwd(),
            declareExternallyReferenced: true,
            enableConstEnums: true,
            format: true,
            ignoreMinAndMaxItems: false,
            maxItems: -1,
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
            const fkTs = updateFkTypes(ts, jsonSchema);
            return fkTs;
        });
}

/**
 * update foreign key types to "ObjectId | <Model>",
 * add import statements for ObjectId and Models.
 * @param interfaceString 
 * @param jsonSchema 
 * @returns 
 */
function updateFkTypes(interfaceString: string, jsonSchema: any): string {
    let result: string = interfaceString;
    const modelNames = Object.keys(jsonSchema.definitions || {});

    Object.keys(jsonSchema.properties).forEach((key: any) => {
        const props = jsonSchema.properties[key];
        const isArray = props.type === "array";

        if (props["x-foreignKey"] || isArray && props.items["x-foreignKey"]) {
            const item = props;
            const itemTypeString = isArray ? props.items.type+"[]" : item.type;
            const modelName = isArray ? props.items["x-foreignKey"] : props["x-foreignKey"];
            modelNames.push(modelName);

            // replace be "key?: type" and "key: type"
            result = result.replace(
                `${key}?: ${itemTypeString}`,
                `${key}?: ObjectId | ${modelName}`
            );
        }
        else if (props.type === "object") {
            result = updateFkTypes(result, props);
        }
    });

    // add import ObjectId, Models
    // todo : check imported model are exist.
    if (modelNames.length > 0) {
        const imports = [
            "import { ObjectId } from \"mongodb\";"
        ];

        modelNames.forEach(modelName => {
            imports.push(`import { ${modelName} } from "./${modelName}";`);
        });

        result = imports.join("\n") + "\n" + result;
    }

    return result;
}