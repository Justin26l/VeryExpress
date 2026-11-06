import * as types from "../types/types";
import log from "../utils/logger";
import { deleteAccountTables, isAccountDeletionEnabled } from "../utils/generator";
import { findUserIdIdentity } from "./auditFields";
import { findSoftDeleteField } from "./softDelete";

/**
 * Rows removed with an account, beyond the identity row itself.
 *
 * Declared with `auth.deleteAccount.deleteTables: ["UserContact", ...]`. For each document
 * the generator resolves the field that points at the identity row, then soft-deletes or
 * hard-deletes the user's rows — whichever the document declares.
 */
export interface DeleteTablePlan {
    documentName: string;
    schema: types.jsonSchema;
    /** Property that carries the identity value. */
    userField: string;
    /** Set when the document declares a soft-delete marker. */
    softDeleteField?: string;
}

/**
 * Property linking a document to the identity row.
 *
 * A foreign key to the identity document wins; a plain `userId` string is the fallback.
 */
export function findUserLinkField(
    schema: types.jsonSchema,
    identityDocumentName: string,
    identityField: string,
): string | undefined {
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        const foreignKey = prop?.["x-foreignKey"];
        if (foreignKey
            && foreignKey.schemaName === identityDocumentName
            && foreignKey.fieldName === identityField) {
            return key;
        }
    }

    const plain = schema.properties?.["userId"];
    if (plain && plain.type === "string") return "userId";

    return undefined;
}

export function collectDeleteTablePlans(
    documents: { path: string, schema: types.jsonSchema }[],
    compilerOptions: types.compilerOptions,
): DeleteTablePlan[] {
    const tables = deleteAccountTables(compilerOptions);
    if (tables.length === 0) return [];

    const identity = findUserIdIdentity(documents);
    if (!identity) return [];

    const byName = new Map<string, types.jsonSchema>();
    for (const doc of documents) {
        const name = doc.schema["x-documentConfig"]?.documentName;
        if (name) byName.set(name, doc.schema);
    }

    const plans: DeleteTablePlan[] = [];
    for (const documentName of tables) {
        const schema = byName.get(documentName);
        if (!schema) continue;

        const userField = findUserLinkField(schema, identity.documentName, identity.field);
        if (!userField) continue;

        const marker = findSoftDeleteField(schema);
        plans.push({
            documentName,
            schema,
            userField,
            softDeleteField: marker?.field,
        });
    }
    return plans;
}

/** Generation-time check: every configured table exists and can be linked to the identity row. */
export function validateDeleteAccountConfig(
    documents: { path: string, schema: types.jsonSchema }[],
    compilerOptions: types.compilerOptions,
): void {
    const tables = deleteAccountTables(compilerOptions);
    if (tables.length === 0) return;

    const problems: string[] = [];

    if (!isAccountDeletionEnabled(compilerOptions)) {
        problems.push(
            `auth.deleteAccount.deleteTables is set, but account deletion is disabled — ` +
            `enable auth.deleteAccount or remove deleteTables.`,
        );
    }

    const identity = findUserIdIdentity(documents);
    if (!identity) {
        problems.push(
            `auth.deleteAccount.deleteTables is set, but no document tags x-vexData "userId" — ` +
            `there is no identity row to link the tables to.`,
        );
    }

    const byName = new Map<string, types.jsonSchema>();
    for (const doc of documents) {
        const name = doc.schema["x-documentConfig"]?.documentName;
        if (name) byName.set(name, doc.schema);
    }

    const seen = new Set<string>();
    for (const documentName of tables) {
        if (seen.has(documentName)) {
            problems.push(`auth.deleteAccount.deleteTables lists "${documentName}" more than once.`);
            continue;
        }
        seen.add(documentName);

        const schema = byName.get(documentName);
        if (!schema) {
            problems.push(
                `auth.deleteAccount.deleteTables names "${documentName}", which is not a schema in the project.`,
            );
            continue;
        }

        if (identity && documentName === identity.documentName) {
            problems.push(
                `auth.deleteAccount.deleteTables names the identity document "${documentName}". ` +
                `The identity row is handled by the deletion flow itself.`,
            );
            continue;
        }

        if (identity && !findUserLinkField(schema, identity.documentName, identity.field)) {
            problems.push(
                `"${documentName}" is listed in auth.deleteAccount.deleteTables but has no property ` +
                `linking it to "${identity.documentName}". Add a userId string property, or an ` +
                `x-foreignKey to "${identity.documentName}.${identity.field}".`,
            );
        }
    }

    if (problems.length > 0) {
        log.error(
            `Account deletion definition error:\n` + problems.map(p => `  - ${p}`).join("\n"),
        );
    }
}
