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
    const currentDocumnetName = jsonSchema["x-documentConfig"]?.documentName;

    // Reverse FK relations (other schemas pointing to this one)
    const reverseFkProps = (jsonSchema.interface?.fkProps || [])
        .filter((fkProp, index, self) => index === self.findIndex((p) => p.propName === fkProp.propName));

    // Direct FK relations (this schema's own x-foreignKey properties / pointing to other schemas)
    const directFkProps: types.fkProps[] = [];
    for (const prop of Object.values(jsonSchema.properties ?? {})) {
        const fk = (prop as types.jsonSchemaPropsItem)["x-foreignKey"];
        if (fk) {
            const propName = utils.common.camelCase(fk.schemaName);
            const interfaceName = utils.common.pascalCase(fk.schemaName);
            if (!directFkProps.some((p) => p.propName === propName)) {
                directFkProps.push({ propName, interfaceName, relationType: fk.relationType as types.DbRelationType, imports: [] });
            }
        }
    }

    const joinWhitelist = jsonSchema["x-documentConfig"]?.restApi?.joinWhitelist as string[] | undefined;
    const allFkProps = [...reverseFkProps, ...directFkProps];
    const apiFkProps = !joinWhitelist ? allFkProps : allFkProps.filter((fkProp) => joinWhitelist.includes(fkProp.propName));

    const titleMatch = interfaceString.match(/export interface (\w+)/);
    if (!titleMatch) return interfaceString;
    const title = titleMatch[1];

    let updatedInterface = interfaceString;

    const buildRelationsProps = (props: typeof allFkProps, typeSuffix: string): string => 
        props.map((fkProp) => {
            const interfaceName = fkProp.interfaceName + typeSuffix;
            const isArray = fkProp.relationType === types.DbRelationType.OneToMany ? '[]' : '';
            const typeString = `${interfaceName}${isArray}`;
            if (!fkProp.imports.includes(interfaceName)) fkProp.imports.push(interfaceName);
            return `    ${fkProp.propName}?: ${typeString};`;
        })
            .join("\n");
    

    const relationsBlock =
        `\n/** Full DB relations — internal use only, no whitelist restriction */\n` +
        `export interface ${title}Relations {\n${buildRelationsProps(allFkProps, "WithRelations")}\n}\n\n` +
        `export type ${title}WithRelations = ${title} & ${title}Relations;\n\n` +
        `/** API relations — restricted by restApi.joinWhitelist */\n` +
        `export interface ${title}ApiRelations {\n${buildRelationsProps(apiFkProps, "WithApiRelations")}\n}\n\n` +
        `export type ${title}WithApiRelations = ${title} & ${title}ApiRelations;\n`;

    allFkProps.forEach((fkProp) => {
        updatedInterface = prependImports(updatedInterface, fkProp.imports, fkProp.interfaceName);
    });
    
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
function prependImports(interfaceString: string, imports: string[], importFile: string): string {
    const importLine = `import { ${imports.join(", ")} } from "./${importFile}.gen";`;
    if (interfaceString.includes(importLine)) {
        return interfaceString;
    }
    const exportIndex = interfaceString.indexOf("export interface");
    if (exportIndex < 0) {
        return interfaceString;
    }
    return interfaceString.slice(0, exportIndex) + importLine + "\n" + interfaceString.slice(exportIndex);
}
