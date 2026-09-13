import * as types from "../types/types";
import log from "../utils/logger";

/**
 * Auto-written audit / ownership fields.
 *
 * A field is declared as framework-managed by giving it one of the reserved
 * `default` keyword values. The DB layer then fills it on the write paths
 * (create / update / replace) and strips any client-supplied value.
 *
 * See docs/features/auditFields.md.
 */

export const VEX_DEFAULT_KEYWORDS: string[] = Object.values(types.vexDefaultKeyword);

export interface vexFieldDefinition {
    field: string;
    type: types.vexDefaultKeyword;
}

/** The field tagged `x-vexData: "userId"` — the source of every ownership/audit user id. */
export interface auditIdentity {
    documentName: string;
    schemaPath: string;
    field: string;
    prop: types.jsonSchemaPropsItem;
}

/** PostgreSQL column family a property resolves to. Used to keep identity and audit columns aligned. */
export type columnFamily = "uuid" | "bigint" | "timestamptz" | "enum" | "other";

const X_FORMAT_FAMILY: Record<string, columnFamily> = {
    [types.xFormatType.Primary]: "uuid",
    [types.xFormatType.PrimaryUUID]: "uuid",
    [types.xFormatType.UUID]: "uuid",
    [types.xFormatType.UnixTimestamp]: "bigint",
    [types.xFormatType.Timestamp]: "timestamptz",
};

export function isVexDefaultKeyword(value: unknown): value is types.vexDefaultKeyword {
    return typeof value === "string" && VEX_DEFAULT_KEYWORDS.includes(value);
}

export function isUserIdMarker(prop?: types.jsonSchemaPropsItem): boolean {
    return prop?.["x-vexData"] === types.xVexDataType.UserId;
}

export function isPrimaryFormat(prop: types.jsonSchemaPropsItem): boolean {
    return prop["x-format"] === types.xFormatType.Primary
        || prop["x-format"] === types.xFormatType.PrimaryUUID;
}

export function resolveColumnFamily(prop: types.jsonSchemaPropsItem): columnFamily {
    const xFormat = prop["x-format"];
    if (typeof xFormat === "string" && X_FORMAT_FAMILY[xFormat]) return X_FORMAT_FAMILY[xFormat];
    if (prop.format === "uuid") return "uuid";
    if (Array.isArray(prop.enum)) return "enum";
    if (prop.type === "integer") return "bigint";
    return "other";
}

/** Fields of one document that the DB layer fills automatically. */
export function collectVexFields(schema: types.jsonSchema): vexFieldDefinition[] {
    const fields: vexFieldDefinition[] = [];
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        if (isVexDefaultKeyword(prop?.["default"])) {
            fields.push({ field: key, type: prop["default"] as types.vexDefaultKeyword });
        }
    }
    return fields;
}

/**
 * Copy of a schema with the reserved `default` keywords removed.
 *
 * External tooling (json2mongoose) copies `default` straight into the model, where a
 * keyword would become a literal string default. Handing it a sanitized copy keeps the
 * declaration in the source schema while the audit values stay owned by the adapter.
 */
export function stripReservedDefaults(schema: types.jsonSchema): types.jsonSchema {
    const stripped = JSON.parse(JSON.stringify(schema)) as types.jsonSchema;
    for (const prop of Object.values(stripped.properties ?? {})) {
        if (isVexDefaultKeyword(prop?.["default"])) delete prop["default"];
    }
    return stripped;
}

export function hasReservedDefaults(schema: types.jsonSchema): boolean {
    return collectVexFields(schema).length > 0;
}

/** The single `x-vexData: "userId"` field across all documents, if any. */
export function findUserIdIdentity(
    documents: { path: string, schema: types.jsonSchema }[],
): auditIdentity | undefined {
    const found: auditIdentity[] = [];
    for (const doc of documents) {
        const documentName = doc.schema["x-documentConfig"]?.documentName ?? doc.path;
        for (const [key, prop] of Object.entries(doc.schema.properties ?? {})) {
            if (isUserIdMarker(prop)) {
                found.push({ documentName, schemaPath: doc.path, field: key, prop });
            }
        }
    }
    return found[0];
}

interface validationContext {
    documents: { path: string, schema: types.jsonSchema }[];
    identity?: auditIdentity;
    problems: string[];
}

function describeField(schemaPath: string, documentName: string, field: string): string {
    return `${documentName}.${field} (${schemaPath})`;
}

/** Reserved keyword used on a field the API demands from the client — it would be stripped again. */
function checkKeywordFieldsAreNotRequired(ctx: validationContext, doc: { path: string, schema: types.jsonSchema }): void {
    const documentName = doc.schema["x-documentConfig"]?.documentName ?? doc.path;
    const requiredFields = Array.isArray(doc.schema.required) ? doc.schema.required : [];

    for (const vexField of collectVexFields(doc.schema)) {
        const prop = doc.schema.properties[vexField.field];
        const path = describeField(doc.path, documentName, vexField.field);

        if (requiredFields.includes(vexField.field) || prop.required === true) {
            ctx.problems.push(
                `"${path}" is declared with default "${vexField.type}" but is marked required. ` +
                `Auto-written fields are filled by the server and must not be required from the client.`
            );
        }
    }
}

function checkTimestampKeywordForm(ctx: validationContext, doc: { path: string, schema: types.jsonSchema }): void {
    const documentName = doc.schema["x-documentConfig"]?.documentName ?? doc.path;

    for (const vexField of collectVexFields(doc.schema)) {
        const prop = doc.schema.properties[vexField.field];
        const path = describeField(doc.path, documentName, vexField.field);

        if (vexField.type === types.vexDefaultKeyword.OnCreateTimestamp
            || vexField.type === types.vexDefaultKeyword.OnUpdateTimestamp) {
            if (prop.type !== "string" || prop["x-format"] !== types.xFormatType.Timestamp) {
                ctx.problems.push(
                    `"${path}" is declared with default "${vexField.type}" — expected ` +
                    `{ "type": "string", "x-format": "${types.xFormatType.Timestamp}" }.`
                );
            }
        }
        else if (vexField.type === types.vexDefaultKeyword.OnCreateUnixTimestamp
            || vexField.type === types.vexDefaultKeyword.OnUpdateUnixTimestamp) {
            if (prop.type !== "integer" || prop["x-format"] !== types.xFormatType.UnixTimestamp) {
                ctx.problems.push(
                    `"${path}" is declared with default "${vexField.type}" — expected ` +
                    `{ "type": "integer", "x-format": "${types.xFormatType.UnixTimestamp}" }.`
                );
            }
        }
    }
}

/** Every `onXXUserId` field must resolve to the same column family as the tagged identity field. */
function checkUserIdKeywordTypes(ctx: validationContext, doc: { path: string, schema: types.jsonSchema }): void {
    const identity = ctx.identity;
    if (!identity) return;

    const documentName = doc.schema["x-documentConfig"]?.documentName ?? doc.path;
    const identityFamily = resolveColumnFamily(identity.prop);
    const identityPath = describeField(identity.schemaPath, identity.documentName, identity.field);

    for (const vexField of collectVexFields(doc.schema)) {
        const isUserIdKeyword = vexField.type === types.vexDefaultKeyword.OnCreateUserId
            || vexField.type === types.vexDefaultKeyword.OnUpdateUserId;
        if (!isUserIdKeyword) continue;

        const prop = doc.schema.properties[vexField.field];
        const path = describeField(doc.path, documentName, vexField.field);

        if (resolveColumnFamily(prop) !== identityFamily) {
            ctx.problems.push(
                `"${path}" is declared with default "${vexField.type}" but resolves to a "${resolveColumnFamily(prop)}" column, ` +
                `while the x-vexData "userId" field resolves to "${identityFamily}" — ` +
                `identity source: "${identityPath}". Both sides must use the same column type.`
            );
        }
    }
}

/** Reject unknown x-vexData values early — a typo would silently disable the feature. */
function checkVexDataValues(ctx: validationContext, doc: { path: string, schema: types.jsonSchema }): void {
    const documentName = doc.schema["x-documentConfig"]?.documentName ?? doc.path;
    const knownValues: string[] = Object.values(types.xVexDataType);

    for (const [key, prop] of Object.entries(doc.schema.properties ?? {})) {
        const value = prop?.["x-vexData"];
        if (value === undefined) continue;
        if (typeof value !== "string" || !knownValues.includes(value)) {
            ctx.problems.push(
                `"${describeField(doc.path, documentName, key)}" has x-vexData "${String(value)}" — ` +
                `expected one of: ${knownValues.join(" | ")}.`
            );
        }
    }
}

function checkIdentityField(ctx: validationContext): void {
    const identity = ctx.identity;
    if (!identity) return;

    const path = describeField(identity.schemaPath, identity.documentName, identity.field);
    const requiredFields = Array.isArray(identity.prop.required) ? identity.prop.required : [];

    if (identity.prop.type !== "string") {
        ctx.problems.push(
            `"${path}" is tagged x-vexData "userId" but type is "${identity.prop.type}" — expected "string".`
        );
    }
    if (identity.prop.index !== true && !isPrimaryFormat(identity.prop) && !requiredFields.includes(identity.field)) {
        ctx.problems.push(
            `"${path}" is tagged x-vexData "userId" but is not indexed — add "index": true; ` +
            `it is used as the lookup key by the token refresh flow.`
        );
    }
}

/**
 * Cross-document validation of the audit / ownership declarations.
 * Called once after every schema has been loaded and formatted.
 */
export function validateAuditFields(
    documents: { path: string, schema: types.jsonSchema }[],
): auditIdentity | undefined {
    const taggedFields: auditIdentity[] = [];
    for (const doc of documents) {
        const documentName = doc.schema["x-documentConfig"]?.documentName ?? doc.path;
        for (const [key, prop] of Object.entries(doc.schema.properties ?? {})) {
            if (isUserIdMarker(prop)) taggedFields.push({ documentName, schemaPath: doc.path, field: key, prop });
        }
    }

    const ctx: validationContext = { documents, identity: taggedFields[0], problems: [] };

    if (taggedFields.length > 1) {
        const paths = taggedFields.map(t => describeField(t.schemaPath, t.documentName, t.field));
        ctx.problems.push(
            `x-vexData "userId" is declared on ${taggedFields.length} fields [${paths.join(", ")}] — ` +
            `exactly one identity source is allowed.`
        );
    }

    const usesUserIdKeyword = documents.some(doc => collectVexFields(doc.schema).some(
        f => f.type === types.vexDefaultKeyword.OnCreateUserId || f.type === types.vexDefaultKeyword.OnUpdateUserId
    ));
    if (usesUserIdKeyword && !ctx.identity) {
        ctx.problems.push(
            `Schema declares "onCreateUserId" / "onUpdateUserId" defaults but no field is tagged ` +
            `x-vexData "userId" — the framework has no identity source to read from.`
        );
    }

    checkIdentityField(ctx);
    for (const doc of documents) {
        checkVexDataValues(ctx, doc);
        checkKeywordFieldsAreNotRequired(ctx, doc);
        checkTimestampKeywordForm(ctx, doc);
        checkUserIdKeywordTypes(ctx, doc);
    }

    if (ctx.problems.length > 0) {
        log.error(
            `Audit field definition error:\n` + ctx.problems.map(p => `  - ${p}`).join("\n")
        );
    }

    return ctx.identity;
}
