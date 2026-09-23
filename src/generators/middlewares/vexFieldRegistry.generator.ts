import utils from "~/utils";
import * as utilsGenerator from "~/utils/generator";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { collectVexFields, findUserIdIdentity } from "~/preprocess/auditFields";
import { collectSoftDeleteEntities } from "~/preprocess/softDelete";

/**
 * Generates VexFieldRegistry.gen.ts — the runtime contract for framework-managed fields.
 *
 * - `entityVexFields`: entity class name → fields the adapter must strip and then
 *   fill on the matching write phase.
 * - `vexUserIdField`: the single field tagged x-vexData "userId"; the token and the
 *   request context read the identity value from it.
 * - `entitySoftDeleteFields`: entity class name → the boolean field carrying its
 *   soft-delete marker (`x-vexData: "softDelete"`).
 * - `showSoftDeleted`: `app.showSoftDeleted` baked in as a constant, i.e. whether the
 *   adapters hide marked rows.
 *
 * The TypeORM and Mongoose adapters read this registry at runtime, and so does the generated
 * account-state guard. See docs/features/auditFields.md and docs/features/accountDeletion.md.
 */
export async function compile(options: {
    allSchemas: types.jsonSchema[];
    documents?: { path: string, schema: types.jsonSchema }[];
    middlewareDir: string;
    compilerOptions?: types.compilerOptions;
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

    // soft delete — only entities that declare a marker, so the adapter check stays a map lookup
    const softDeleteEntities = options.documents ? collectSoftDeleteEntities(options.documents) : [];
    const softDeleteEntries = softDeleteEntities.map(
        entity => `    "${entity.documentName}Entity": "${entity.field}"`
    );

    const showSoftDeleted = options.compilerOptions
        ? utilsGenerator.isShowSoftDeleted(options.compilerOptions)
        : false;
    const showSoftDeletedComment = showSoftDeleted
        ? "// WARNING: app.showSoftDeleted is ON — soft-deleted rows are visible to every query,\n" +
          "// are writable through the ordinary CRUD path again, and the account-state guard still\n" +
          "// rejects tombstoned identities because it reads the marker value directly."
        : "// app.showSoftDeleted is off (default) — the repository hides soft-deleted rows.";

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

/**
 * Entity class name → the boolean field carrying its soft-delete marker
 * (\`x-vexData: "softDelete"\`). Empty when no schema declares one.
 */
export const entitySoftDeleteFields: Record<string, string> = {
${softDeleteEntries.join(",\n")}
};

${showSoftDeletedComment}
export const showSoftDeleted = ${showSoftDeleted};
`;

    const outPath = `${options.middlewareDir}/VexFieldRegistry.gen.ts`;
    utils.common.writeFile("Vex Field Registry", outPath, utils.template.format(source));
}

export default { compile };
