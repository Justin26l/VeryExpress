import * as types from "../types/types";
import log from "../utils/logger";

/**
 * Soft delete — the schema-declared tombstone marker.
 *
 * An entity opts in by tagging one boolean property with `"x-vexData": "softDelete"`. The marker
 * is then owned by the framework:
 *
 * - stripped from generated request bodies (`collectRequestManagedFields`), so a client can never
 *   soft-delete, resurrect or pre-tombstone a row through the CRUD API;
 * - used by the repository adapters to hide marked rows from every ordinary read and write;
 * - read directly by the account-state guard so a deleted user's live token stops working.
 *
 * There is no separate `deletedAt` / `deletedBy`: the existing audit fields (`updatedAt` /
 * `updatedBy`, declared with reserved `default` keywords) record who tombstoned the row and when.
 *
 * See docs/features/accountDeletion.md.
 */

export interface softDeleteDefinition {
    /** the field carrying the marker */
    field: string;
    prop: types.jsonSchemaPropsItem;
}

/** The `x-vexData: "softDelete"` field of a document, if it declares one. */
export function findSoftDeleteField(schema: types.jsonSchema): softDeleteDefinition | undefined {
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        if (prop?.["x-vexData"] === types.xVexDataType.SoftDelete) {
            return { field: key, prop };
        }
    }
    return undefined;
}

/** Every document that declares a marker, in the order they were loaded. */
export function collectSoftDeleteEntities(
    documents: { path: string, schema: types.jsonSchema }[],
): { documentName: string, schemaPath: string, field: string }[] {
    const found: { documentName: string, schemaPath: string, field: string }[] = [];

    for (const doc of documents) {
        const marker = findSoftDeleteField(doc.schema);
        if (!marker) continue;

        found.push({
            documentName: doc.schema["x-documentConfig"]?.documentName ?? doc.path,
            schemaPath: doc.path,
            field: marker.field,
        });
    }

    return found;
}

function describeField(schemaPath: string, documentName: string, field: string): string {
    return `${documentName}.${field} (${schemaPath})`;
}

/** A marker that is not a required, defaulted boolean would make the hide-filter drop live rows. */
function checkMarkerShape(
    problems: string[],
    doc: { path: string, schema: types.jsonSchema },
    marker: softDeleteDefinition,
): void {
    const documentName = doc.schema["x-documentConfig"]?.documentName ?? doc.path;
    const path = describeField(doc.path, documentName, marker.field);
    const requiredFields = Array.isArray(doc.schema.required) ? doc.schema.required : [];

    if (marker.prop.type !== "boolean") {
        problems.push(
            `"${path}" is tagged x-vexData "softDelete" but type is "${marker.prop.type}" — expected "boolean".`
        );
    }

    if (marker.prop.default !== false) {
        problems.push(
            `"${path}" is tagged x-vexData "softDelete" but does not declare "default": false — ` +
            `existing rows must default to "not deleted".`
        );
    }

    if (!requiredFields.includes(marker.field) && marker.prop.required !== true) {
        problems.push(
            `"${path}" is tagged x-vexData "softDelete" but is not required. The generated column ` +
            `must be NOT NULL DEFAULT false — a nullable marker makes the hide-filter ` +
            `(marker IS NOT TRUE) drop every live row written before the column existed.`
        );
    }
}

/** One marker per document, mirroring the single-identity rule for `x-vexData: "userId"`. */
function checkSingleMarkerPerDocument(
    problems: string[],
    doc: { path: string, schema: types.jsonSchema },
): void {
    const documentName = doc.schema["x-documentConfig"]?.documentName ?? doc.path;
    const markers: string[] = [];

    for (const [key, prop] of Object.entries(doc.schema.properties ?? {})) {
        if (prop?.["x-vexData"] === types.xVexDataType.SoftDelete) markers.push(key);
    }

    if (markers.length > 1) {
        problems.push(
            `x-vexData "softDelete" is declared on ${markers.length} fields of ` +
            `"${documentName}" [${markers.join(", ")}] (${doc.path}) — at most one is allowed.`
        );
    }
}

/**
 * Cross-document validation of the soft-delete declarations.
 * Called once after every schema has been loaded and formatted.
 */
export function validateSoftDeleteFields(
    documents: { path: string, schema: types.jsonSchema }[],
): void {
    const problems: string[] = [];

    for (const doc of documents) {
        checkSingleMarkerPerDocument(problems, doc);

        const marker = findSoftDeleteField(doc.schema);
        if (marker) checkMarkerShape(problems, doc, marker);
    }

    if (problems.length > 0) {
        log.error(
            `Soft delete definition error:\n` + problems.map(p => `  - ${p}`).join("\n")
        );
    }
}
