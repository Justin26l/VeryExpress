import * as jsonToTypescript from "json-schema-to-typescript";
import log from "../../utils/logger";
import utils from "~/utils";
import * as types from "~/types/types";

export async function compile(
    jsonSchema: types.jsonSchema, 
    outputPath: string,
    // compilerOptions: types.compilerOptions
): Promise<void> {
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
        .then(interfaceString => applyFkToInterface(interfaceString, jsonSchema))
        .then(interfaceString => appendEnumDeclarations(interfaceString, jsonSchema));

    utils.common.writeFile(title, outputPath, "// {{headerComment}}\n" + content);
    return;
}

function applyFkToInterface(interfaceString: string, jsonSchema: types.jsonSchema): string {
    const fkProps = jsonSchema.interface?.fkProps;
    if (!fkProps || fkProps.length === 0) return interfaceString;

    const titleMatch = interfaceString.match(/export interface (\w+)/);
    if (!titleMatch) return interfaceString;
    const title = titleMatch[1];

    let updatedInterface = interfaceString;

    fkProps.forEach((fkProp) => {
        updatedInterface = prependImports(updatedInterface, fkProp.interfaceName);
    });

    const relationsProps = fkProps
        .map((fkProp) => {
            const typeString = fkProp.relationType === types.DbRelationType.OneToMany ? `${fkProp.interfaceName}[]` : fkProp.interfaceName;
            return `    ${fkProp.propName}?: ${typeString};`;
        })
        .join("\n");

    const relationsBlock =
        `\nexport interface ${title}Relations {\n${relationsProps}\n}\n\n` +
        `export type ${title}WithRelations = ${title} & ${title}Relations;\n`;

    updatedInterface = updatedInterface.replace(/\s+$/, "") + "\n" + relationsBlock;

    return updatedInterface;
}

/**
 * Append enum declarations for fields with enum values, replacing union string types with the enum type.
 */
function appendEnumDeclarations(interfaceString: string, jsonSchema: types.jsonSchema): string {
    let updatedInterface = interfaceString;

    for (const key of Object.keys(jsonSchema.properties ?? {})) {
        const prop = jsonSchema.properties[key];
        if (!prop.enum || !Array.isArray(prop.enum)) continue;

        const enumName = utils.common.pascalCase(key) + "Enum";
        const enumBody = prop.enum.map((v: string) => `    ${v} = "${v}"`).join(",\n");
        const enumDeclaration = `export enum ${enumName} {\n${enumBody}\n}`;

        // replace the generated union type with the enum type in the interface
        const unionType = prop.enum.map((v: string) => `"${v}"`).join(" | ");
        updatedInterface = updatedInterface.replace(new RegExp(`(\\s+${key}\\??: )${unionType.replace(/[|"]/g, "\\$&")};`), `$1${enumName};`);

        // append enum declaration after the interface block
        if (!updatedInterface.includes(`export enum ${enumName}`)) {
            updatedInterface = updatedInterface.replace(/\s+$/, "") + "\n\n" + enumDeclaration + "\n";
        }
    }

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
