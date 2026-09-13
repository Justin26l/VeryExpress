import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { collectVexFields, findUserIdIdentity } from "~/preprocess/auditFields";

/**
 * Generates VexFieldRegistry.gen.ts — the runtime contract for auto-written
 * audit / ownership fields.
 *
 * - `entityVexFields`: entity class name → fields the adapter must strip and then
 *   fill on the matching write phase.
 * - `vexUserIdField`: the single field tagged x-vexData "userId"; the token and the
 *   request context read the identity value from it.
 *
 * The TypeORM and Mongoose adapters read this registry at runtime. See
 * docs/features/auditFields.md.
 */
export async function compile(options: {
    allSchemas: types.jsonSchema[];
    documents?: { path: string, schema: types.jsonSchema }[];
    middlewareDir: string;
}): Promise<void> {
    log.process("Vex Field Registry");

    const entries: string[] = [];

    for (const schema of options.allSchemas) {
        const documentName = schema["x-documentConfig"].documentName;
        const fields = collectVexFields(schema);
        if (fields.length === 0) continue;

        const fieldEntries = fields.map(f => `        { field: "${f.field}", type: "${f.type}" }`);
        entries.push(`    "${documentName}Entity": [\n${fieldEntries.join(",\n")}\n    ]`);
    }

    const identity = options.documents ? findUserIdIdentity(options.documents) : undefined;
    const userIdField = identity ? identity.field : "_id";

    const source = `// {{headerComment}}
export type VexFieldType =
    | "onCreateTimestamp"
    | "onCreateUnixTimestamp"
    | "onUpdateTimestamp"
    | "onUpdateUnixTimestamp"
    | "onCreateUserId"
    | "onUpdateUserId";

export interface VexFieldEntry {
    field: string;
    type: VexFieldType;
}

/**
 * Fields the DB layer owns per entity. Declared with the reserved \`default\` keywords in the
 * JSON Schema; stripped from client input and filled by the repository adapter.
 */
export const entityVexFields: Record<string, VexFieldEntry[]> = {
${entries.join(",\n")}
};

/**
 * Field tagged \`x-vexData: "userId"\` — where the identity value (createdBy / updatedBy) comes from.
 * Falls back to "_id" when no schema tags one.
 */
export const vexUserIdField = "${userIdField}";
`;

    const outPath = `${options.middlewareDir}/VexFieldRegistry.gen.ts`;
    utils.common.writeFile("Vex Field Registry", outPath, utils.template.format(source));
}

export default { compile };
