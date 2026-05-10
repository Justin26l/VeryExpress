import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";

/**
 * Generates JoinWhitelistRegistry.gen.ts — a static object mapping
 * documentName → { relationName → relatedDocumentName }.
 *
 * Imported by JoinWhitelistMiddleware to validate join paths without
 * requiring each controller to call register() at runtime.
 */
export async function compile(options: {
    allSchemas: types.jsonSchema[];
    middlewareDir: string;
}): Promise<void> {
    log.process("JoinWhitelist Registry");

    const registryEntries = options.allSchemas
        .map(schema => {
            const documentName = schema["x-documentConfig"].documentName;
            const relationMap = buildRelationMap(schema);
            return { documentName, relationMap };
        })
        .filter(entry => Object.keys(entry.relationMap).length > 0);

    const entriesSource = registryEntries
        .map(({ documentName, relationMap }) =>
            `    "${documentName}": ${JSON.stringify(relationMap)}`
        )
        .join(",\n");

    const source = `// {{headerComment}}
const joinWhitelistRegistry: Record<string, Record<string, string>> = {
${entriesSource}
};

export default joinWhitelistRegistry;
`;

    const outPath = `${options.middlewareDir}/JoinWhitelistRegistry.gen.ts`;
    utils.common.writeFile("JoinWhitelist Registry", outPath, utils.template.format(source));
}

/**
 * Build a map of { relationName → relatedDocumentName } for a schema,
 * filtered by restApi.joinWhitelist if present.
 */
export function buildRelationMap(schema: types.jsonSchema): Record<string, string> {
    const whitelist = schema["x-documentConfig"].restApi.joinWhitelist;
    const whitelistSet = whitelist ? new Set(whitelist) : null;

    const map: Record<string, string> = {};

    // local FK properties on this schema
    for (const prop of Object.values(schema.properties ?? {})) {
        const fk = (prop as types.jsonSchemaPropsItem)["x-foreignKey"];
        if (fk) {
            const relationName = utils.common.camelCase(fk.schemaName);
            if (!whitelistSet || whitelistSet.has(relationName)) {
                map[relationName] = fk.schemaName;
            }
        }
    }

    // reverse FK relations populated by preprocess
    for (const fkProp of schema.interface?.fkProps ?? []) {
        const relationName = utils.common.camelCase(fkProp.propName);
        if (!whitelistSet || whitelistSet.has(relationName)) {
            map[relationName] = fkProp.interfaceName;
        }
    }

    return map;
}