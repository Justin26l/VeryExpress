import { beforeEach, describe, expect, it, vi } from "vitest";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("../../src/utils/logger", () => ({
    default: {
        process: vi.fn(),
        writing: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: logError,
    },
}));

import {
    collectSoftDeleteEntities,
    findSoftDeleteField,
    validateSoftDeleteFields,
} from "../../src/preprocess/softDelete";
import { collectRequestManagedFields } from "../../src/preprocess/auditFields";
import * as types from "../../src/types/types";

/**
 * A soft-delete marker is only safe if the generated column is `NOT NULL DEFAULT false`:
 * the adapter's hide-filter is `marker IS NOT TRUE`, so a nullable marker would make every row
 * written before the column existed disappear. These tests pin that contract.
 *
 * `log.error` exits the process in production; here it is mocked so the failure paths can be
 * asserted instead of killing the run.
 */

function schemaDoc(
    documentName: string,
    properties: { [key: string]: types.jsonSchemaPropsItem },
    required: string[] = [],
): { path: string, schema: types.jsonSchema } {
    return {
        path: `./schemas/${documentName}.json`,
        schema: {
            type: "object",
            "x-documentConfig": { documentName, restApi: { methods: ["get"] } },
            properties,
            required,
        },
    };
}

/** A well-formed marker: boolean, defaulted false, and required. */
function marker(overrides: Partial<types.jsonSchemaPropsItem> = {}): types.jsonSchemaPropsItem {
    return {
        type: "boolean",
        default: false,
        "x-vexData": types.xVexDataType.SoftDelete,
        ...overrides,
    } as types.jsonSchemaPropsItem;
}

beforeEach(() => {
    logError.mockClear();
});

describe("findSoftDeleteField / collectSoftDeleteEntities", () => {
    it("finds the tagged field", () => {
        const doc = schemaDoc("User", { deleted: marker() }, ["deleted"]);
        expect(findSoftDeleteField(doc.schema)?.field).toBe("deleted");
    });

    it("returns undefined when nothing is tagged", () => {
        const doc = schemaDoc("User", { name: { type: "string" } });
        expect(findSoftDeleteField(doc.schema)).toBeUndefined();
    });

    it("collects only the documents that declare a marker", () => {
        const docs = [
            schemaDoc("User", { deleted: marker() }, ["deleted"]),
            schemaDoc("Job", { title: { type: "string" } }),
        ];
        expect(collectSoftDeleteEntities(docs)).toEqual([
            { documentName: "User", schemaPath: "./schemas/User.json", field: "deleted" },
        ]);
    });
});

describe("validateSoftDeleteFields", () => {
    it("accepts a well-formed marker", () => {
        validateSoftDeleteFields([schemaDoc("User", { deleted: marker() }, ["deleted"])]);
        expect(logError).not.toHaveBeenCalled();
    });

    it("accepts a document with no marker", () => {
        validateSoftDeleteFields([schemaDoc("Job", { title: { type: "string" } })]);
        expect(logError).not.toHaveBeenCalled();
    });

    it("rejects a non-boolean marker", () => {
        validateSoftDeleteFields([
            schemaDoc("User", { deleted: marker({ type: "string" }) }, ["deleted"]),
        ]);
        expect(logError.mock.calls[0][0]).toContain(`expected "boolean"`);
    });

    it("rejects a marker that does not default to false", () => {
        validateSoftDeleteFields([
            schemaDoc("User", { deleted: marker({ default: true }) }, ["deleted"]),
        ]);
        expect(logError.mock.calls[0][0]).toContain(`"default": false`);
    });

    it("rejects a nullable (non-required) marker", () => {
        validateSoftDeleteFields([schemaDoc("User", { deleted: marker() })]);
        expect(logError.mock.calls[0][0]).toContain("not required");
    });

    it("rejects two markers in one document", () => {
        validateSoftDeleteFields([
            schemaDoc("User", { deleted: marker(), removed: { ...marker(), type: "boolean" } }, ["deleted", "removed"]),
        ]);
        expect(logError.mock.calls[0][0]).toContain("at most one is allowed");
    });

    it("reports every problem in one run", () => {
        validateSoftDeleteFields([
            schemaDoc("User", { deleted: marker({ type: "string", default: true }) }),
        ]);
        const reported = logError.mock.calls[0][0] as string;
        expect(reported).toContain(`expected "boolean"`);
        expect(reported).toContain(`"default": false`);
        expect(reported).toContain("not required");
    });
});

/**
 * The marker must never reach a generated request body — otherwise a client could soft-delete,
 * resurrect or pre-tombstone a row through the ordinary CRUD API.
 */
describe("collectRequestManagedFields", () => {
    it("omits the soft-delete marker", () => {
        const doc = schemaDoc("User", {
            _id: { type: "string", "x-format": types.xFormatType.PrimaryUUID } as types.jsonSchemaPropsItem,
            email: { type: "string" } as types.jsonSchemaPropsItem,
            deleted: marker(),
            updatedAt: {
                type: "string",
                "x-format": types.xFormatType.Timestamp,
                default: types.vexDefaultKeyword.OnUpdateTimestamp,
            } as types.jsonSchemaPropsItem,
        }, ["deleted"]);

        const managed = collectRequestManagedFields(doc.schema, false);
        expect(managed).toContain("deleted");
        expect(managed).toContain("updatedAt");
        expect(managed).toContain("_id");
        expect(managed).not.toContain("email");
    });

    it("omits the marker even when clients may set _id", () => {
        const doc = schemaDoc("User", {
            _id: { type: "string", "x-format": types.xFormatType.PrimaryUUID } as types.jsonSchemaPropsItem,
            deleted: marker(),
        }, ["deleted"]);

        const managed = collectRequestManagedFields(doc.schema, true);
        expect(managed).toContain("deleted");
        expect(managed).not.toContain("_id");
    });
});
