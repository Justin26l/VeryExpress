import * as jsonToTypescript from "json-schema-to-typescript";
import log from "../../utils/logger";
import utils from "~/utils";
import * as types from "~/types/types";

export async function compile(jsonSchema: types.jsonSchema, outputPath: string, compilerOptions: types.compilerOptions): Promise<void> {
    const title = String(outputPath.split("/").pop()?.split(".")[0]);
    log.process(`Type : ${title} > ${outputPath}`);
    const content = await jsonToTypescript
        .compile(
            jsonSchema as jsonToTypescript.JSONSchema, 
            title, 
            {
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
            }
        )
        .then(interfaceString => applyFkToInterface(interfaceString, jsonSchema));

    utils.common.writeFile(title, outputPath, "// {{headerComment}}\n" + content);
    return;
}

function applyFkToInterface(interfaceString: string, jsonSchema: types.jsonSchema): string {
    let updatedInterface = interfaceString;

    jsonSchema.interface?.fkProps.forEach((fkProp) => {
        const typeString = fkProp.relationType === types.DbRelationType.OneToMany ? `${fkProp.interfaceName}[]` : fkProp.interfaceName;
        const propertyLine = `    ${fkProp.propName}?: ${typeString};`;
        updatedInterface = appendInterfaceProperty(updatedInterface, propertyLine);
        updatedInterface = prependImports(updatedInterface, fkProp.interfaceName);
    });
    
    return updatedInterface;
}

/**
 * Prepend import statement to the interface string if not exist
 * @param interfaceString 
 * @param importName 
 * @returns 
 */
function prependImports(interfaceString: string, importName: string): string {
    const importLine = `import { ${importName} } from "./${importName}.gen";`;
    if (interfaceString.includes(importLine)) {
        return interfaceString;
    }
    const exportIndex = interfaceString.indexOf("export interface");
    if (exportIndex < 0) {
        return interfaceString;
    }
    return interfaceString.slice(0, exportIndex) + importLine + "\n" + interfaceString.slice(exportIndex);
}

/**
 * Append property line to the interface string if not exist
 * @param interfaceString 
 * @param propertyLine 
 * @returns 
 */
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