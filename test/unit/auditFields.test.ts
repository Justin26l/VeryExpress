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

import { validateAuditFields } from "../../src/preprocess/auditFields";
import { defaultCompilerOptions } from "../../src/utils/generator";
import * as types from "../../src/types/types";

/**
 * Generation-time validation is the first of two defences for audit user fields; the
 * second is the runtime `assertCreateIdentity` in the repository adapters.
 *
 * `log.error` calls `process.exit(1)` — that is the whole point in production, but here
 * it is mocked so the failure paths can be asserted instead of killing the run.
 */

function schemaDoc(
    documentName: string,
    properties: { [key: string]: types.jsonSchemaPropsItem },
): { path: string, schema: types.jsonSchema } {
    return {
        path: `./schemas/${documentName}.json`,
        schema: {
            type: "object",
            "x-documentConfig": { documentName, restApi: { methods: ["get"] } },
            properties,
        },
    };
}

/** The single identity source. Every audit-keyword case needs one, or R2 fires instead. */
const identityField: types.jsonSchemaPropsItem = {
    type: "string",
    "x-format": types.xFormatType.PrimaryUUID,
    "x-vexData": types.xVexDataType.UserId,
    index: true,
};

const userDoc = () => schemaDoc("User", { _id: identityField });

const plainId: types.jsonSchemaPropsItem = {
    type: "string",
    "x-format": types.xFormatType.PrimaryUUID,
};

const jobDoc = (auditField?: { name: string, prop: types.jsonSchemaPropsItem }) => schemaDoc("Job", {
    _id: plainId,
    ...(auditField ? { [auditField.name]: auditField.prop } : {}),
});

const createdBy: { name: string, prop: types.jsonSchemaPropsItem } = {
    name: "createdBy",
    prop: {
        type: "string",
        "x-format": types.xFormatType.UUID,
        default: types.vexDefaultKeyword.OnCreateUserId,
    },
};

const updatedBy: { name: string, prop: types.jsonSchemaPropsItem } = {
    name: "updatedBy",
    prop: {
        type: "string",
        "x-format": types.xFormatType.UUID,
        default: types.vexDefaultKeyword.OnUpdateUserId,
    },
};

function auth(localAuth: boolean, oauthProviders: Record<string, boolean> = {}) {
    return { ...defaultCompilerOptions, auth: { ...defaultCompilerOptions.auth, localAuth, oauthProviders } };
}

function reportedProblems(): string {
    return logError.mock.calls.flat().join("\n");
}

describe("validateAuditFields — create identity must be reachable", () => {
    beforeEach(() => {
        logError.mockClear();
    });

    it("accepts onCreateUserId when local auth is on", () => {
        validateAuditFields([userDoc(), jobDoc(createdBy)], auth(true));

        expect(logError).not.toHaveBeenCalled();
    });

    it("accepts onCreateUserId when only an oauth provider is on", () => {
        validateAuditFields([userDoc(), jobDoc(createdBy)], auth(false, { google: true }));

        expect(logError).not.toHaveBeenCalled();
    });

    /**
     * Without auth no controller mounts Authentication.middleware, so no request can ever
     * carry an identity — every create of this entity would throw at runtime. Catch it here.
     */
    it("rejects onCreateUserId when the app enables no authentication at all", () => {
        validateAuditFields([userDoc(), jobDoc(createdBy)], auth(false, { google: false, github: false }));

        expect(logError).toHaveBeenCalledTimes(1);
        expect(reportedProblems()).toContain("onCreateUserId");
        expect(reportedProblems()).toContain("no authentication");
    });

    /**
     * Scope guard, matching the runtime: `assertCreateIdentity` only refuses a
     * context-less CREATE. An update never throws when the identity is absent, so an
     * auth-less app may declare `onUpdateUserId` and simply leave it unset. Rejecting it
     * here would be stricter than the mechanism it protects — and would break the
     * default `User.json` template, which declares `updatedBy` but is copied into every
     * app unconditionally, including auth-less ones.
     */
    it("accepts onUpdateUserId without auth — only the create keyword is enforced", () => {
        validateAuditFields([userDoc(), jobDoc(updatedBy)], auth(false));

        expect(logError).not.toHaveBeenCalled();
    });

    it("does not fire for an app with no audit keywords at all", () => {
        validateAuditFields([userDoc(), jobDoc()], auth(false));

        expect(logError).not.toHaveBeenCalled();
    });
});
