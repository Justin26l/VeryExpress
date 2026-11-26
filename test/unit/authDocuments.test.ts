import { beforeEach, describe, expect, it, vi } from "vitest";

const { error } = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("../../src/utils/logger", () => ({
    default: {
        process: vi.fn(),
        writing: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: (...args: unknown[]) => error(...args),
    },
}));

import { validateAuthDocuments } from "../../src/preprocess/authDocuments";
import * as types from "../../src/types/types";

function doc(documentName: string): { path: string, schema: types.jsonSchema } {
    return {
        path: `./schemas/${documentName}.json`,
        schema: {
            type: "object",
            "x-documentConfig": { documentName, restApi: { methods: [] } },
            properties: {},
        },
    };
}

function options(overrides: {
    localAuth?: boolean,
    firebase?: boolean,
    roles?: string[],
} = {}): types.compilerOptions {
    const compilerOptions: Record<string, unknown> = {
        app: { useUserSchema: true },
        auth: {
            localAuth: overrides.localAuth ?? false,
            firebase: overrides.firebase ?? false,
            oauthProviders: {},
        },
    };

    if (overrides.roles) compilerOptions.useRBAC = { roles: overrides.roles, default: overrides.roles[0] };

    return compilerOptions as unknown as types.compilerOptions;
}

beforeEach(() => {
    error.mockClear();
});

describe("auth document validation", () => {
    it("is silent when no identity feature is on", () => {
        validateAuthDocuments([doc("Project")], options());
        expect(error).not.toHaveBeenCalled();
    });

    it("is silent when the project ships its own User document", () => {
        validateAuthDocuments([doc("Project"), doc("User")], options({ localAuth: true }));
        expect(error).not.toHaveBeenCalled();
    });

    it("rejects auth without a User document, whatever app.useUserSchema says", () => {
        const compilerOptions = options({ localAuth: true });
        compilerOptions.app.useUserSchema = false;

        validateAuthDocuments([doc("Project")], compilerOptions);

        expect(error).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0][0])).toContain('"User"');
        expect(String(error.mock.calls[0][0])).toContain("app.useUserSchema");
    });

    it("rejects RBAC without a User document", () => {
        validateAuthDocuments([doc("Project")], options({ roles: ["member"] }));

        expect(error).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0][0])).toContain("RBAC");
    });

    it("names both features when both are on", () => {
        validateAuthDocuments([doc("Project")], options({ localAuth: true, roles: ["member"] }));

        expect(String(error.mock.calls[0][0])).toContain("authentication and RBAC");
    });
});
