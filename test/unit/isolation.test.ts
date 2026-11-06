import { describe, expect, it } from "vitest";

import {
    collectIsolationProblems,
    collectIsolationFields,
    isolationRulesOf,
    normalizeIsolationRules,
} from "../../src/preprocess/isolation";
import { collectRequestManagedFields } from "../../src/preprocess/auditFields";
import type { compilerOptions, jsonSchema } from "../../src/types/types";

type doc = { path: string, schema: jsonSchema };

function options(overrides: Partial<compilerOptions> = {}): compilerOptions {
    return {
        auth: { localAuth: true, oauthProviders: {} },
        ...overrides,
    } as compilerOptions;
}

function document(name: string, properties: Record<string, unknown>, config: Record<string, unknown> = {}): doc {
    return {
        path: `./${name}.json`,
        schema: {
            type: "object",
            "x-documentConfig": { documentName: name, restApi: { methods: [] }, ...config },
            properties: properties as jsonSchema["properties"],
        } as jsonSchema,
    };
}

function identityDocument(extraProps: Record<string, unknown> = {}, config: Record<string, unknown> = {}): doc {
    return document("User", {
        _id: { type: "string", "x-format": "PrimaryUUID", "x-vexData": "userId", index: true },
        email: { type: "string" },
        ...extraProps,
    }, config);
}

function userTenantDocument(config: Record<string, unknown> = {}): doc {
    return document("UserTenant", {
        _id: { type: "string", "x-format": "PrimaryUUID" },
        userId: { type: "string", "x-format": "UUID" },
        tenantId: { type: "string", "x-format": "UUID" },
    }, config);
}

function tenantOptions(): compilerOptions {
    return options({ tenant: { enable: true } });
}

describe("isolationRulesOf", () => {
    it("converts the legacy dataIsolation field into an ownership rule", () => {
        expect(isolationRulesOf({ documentName: "A", restApi: { methods: [] }, dataIsolation: { field: "ownerId" } }))
            .toEqual([{ field: "ownerId", source: "user._id", onMissing: "skip" }]);
    });

    it("prefers the current isolation array", () => {
        expect(isolationRulesOf({
            documentName: "A",
            restApi: { methods: [] },
            isolation: [{ field: "tenantId", source: "user.tenantId", onMissing: "deny" }],
            dataIsolation: { field: "ownerId" },
        })).toEqual([{ field: "tenantId", source: "user.tenantId", onMissing: "deny" }]);
    });

    it("returns no rules when nothing is declared", () => {
        expect(isolationRulesOf({ documentName: "A", restApi: { methods: [] } })).toEqual([]);
        expect(isolationRulesOf(undefined)).toEqual([]);
    });
});

describe("normalizeIsolationRules", () => {
    it("fills the default onMissing for each source", () => {
        const docs = [
            document("Project", {
                ownerId: { type: "string" },
                tenantId: { type: "string" },
            }, {
                isolation: [
                    { field: "ownerId", source: "user._id" },
                    { field: "tenantId", source: "user.tenantId" },
                ],
            }),
        ];

        normalizeIsolationRules(docs);

        expect(docs[0].schema["x-documentConfig"].isolation).toEqual([
            { field: "ownerId", source: "user._id", onMissing: "skip" },
            { field: "tenantId", source: "user.tenantId", onMissing: "deny" },
        ]);
    });

    it("leaves a document without rules with an empty list", () => {
        const docs = [document("Plain", { title: { type: "string" } })];
        normalizeIsolationRules(docs);
        expect(docs[0].schema["x-documentConfig"].isolation).toEqual([]);
    });
});

describe("collectIsolationProblems", () => {
    it("accepts a valid tenant rule when the tenant feature is on", () => {
        const problems = collectIsolationProblems(
            [
                identityDocument({ tenantId: { type: "string" } }),
                userTenantDocument(),
                document("Project", { tenantId: { type: "string" } }, {
                    isolation: [{ field: "tenantId", source: "user.tenantId", onMissing: "deny" }],
                }),
            ],
            tenantOptions(),
        );

        expect(problems).toEqual([]);
    });

    it("rejects a tenant rule when the tenant feature is off", () => {
        const problems = collectIsolationProblems(
            [document("Project", { tenantId: { type: "string" } }, {
                isolation: [{ field: "tenantId", source: "user.tenantId", onMissing: "deny" }],
            })],
            options(),
        ).join("\n");

        expect(problems).toMatch(/vex\.config\.tenant\.enable is not true/);
    });

    it("rejects an unknown source and an unknown onMissing", () => {
        const problems = collectIsolationProblems(
            [
                identityDocument(),
                userTenantDocument(),
                document("Project", { ownerId: { type: "string" } }, {
                    isolation: [{ field: "ownerId", source: "user.email", onMissing: "warn" }] as never,
                }),
            ],
            tenantOptions(),
        ).join("\n");

        expect(problems).toMatch(/source "user\.email"/);
        expect(problems).toMatch(/onMissing "warn"/);
    });

    it("rejects a field that is not a string property", () => {
        const problems = collectIsolationProblems(
            [
                identityDocument(),
                userTenantDocument(),
                document("Project", { tenantId: { type: "integer" } }, {
                    isolation: [{ field: "tenantId", source: "user.tenantId", onMissing: "deny" }],
                }),
            ],
            tenantOptions(),
        ).join("\n");

        expect(problems).toMatch(/expected "string"/);
    });

    it("rejects a field that does not exist on the document", () => {
        const problems = collectIsolationProblems(
            [
                identityDocument(),
                userTenantDocument(),
                document("Project", { title: { type: "string" } }, {
                    isolation: [{ field: "tenantId", source: "user.tenantId", onMissing: "deny" }],
                }),
            ],
            tenantOptions(),
        ).join("\n");

        expect(problems).toMatch(/not a property of "Project"/);
    });

    it("rejects a duplicate field", () => {
        const problems = collectIsolationProblems(
            [
                identityDocument(),
                userTenantDocument(),
                document("Project", { tenantId: { type: "string" } }, {
                    isolation: [
                        { field: "tenantId", source: "user.tenantId", onMissing: "deny" },
                        { field: "tenantId", source: "user.tenantId", onMissing: "deny" },
                    ],
                }),
            ],
            tenantOptions(),
        ).join("\n");

        expect(problems).toMatch(/more than once/);
    });

    it("rejects tenant isolation on the identity document", () => {
        const problems = collectIsolationProblems(
            [
                identityDocument({ tenantId: { type: "string" } }, {
                    isolation: [{ field: "tenantId", source: "user.tenantId", onMissing: "deny" }],
                }),
                userTenantDocument(),
            ],
            tenantOptions(),
        ).join("\n");

        expect(problems).toMatch(/scopes the identity document by tenant/);
    });

    it("rejects a tenant-enabled project without the UserTenant document", () => {
        const problems = collectIsolationProblems(
            [identityDocument()],
            tenantOptions(),
        ).join("\n");

        expect(problems).toMatch(/no "UserTenant" document/);
    });

    it("rejects a UserTenant document that declares isolation", () => {
        const problems = collectIsolationProblems(
            [
                identityDocument(),
                userTenantDocument({
                    isolation: [{ field: "tenantId", source: "user.tenantId", onMissing: "deny" }],
                }),
            ],
            tenantOptions(),
        ).join("\n");

        expect(problems).toMatch(/must not declare isolation/);
    });
});

describe("collectIsolationFields", () => {
    it("reports every rule field, in both config forms", () => {
        expect(collectIsolationFields({
            type: "object",
            "x-documentConfig": {
                documentName: "A",
                restApi: { methods: [] },
                isolation: [{ field: "tenantId", source: "user.tenantId", onMissing: "deny" }],
                dataIsolation: { field: "ownerId" },
            },
            properties: {},
        } as jsonSchema)).toEqual(["tenantId"]);

        expect(collectIsolationFields({
            type: "object",
            "x-documentConfig": {
                documentName: "A",
                restApi: { methods: [] },
                dataIsolation: { field: "ownerId" },
            },
            properties: {},
        } as jsonSchema)).toEqual(["ownerId"]);
    });

    it("makes isolation fields server-managed in the request payload", () => {
        const schema = {
            type: "object",
            "x-documentConfig": {
                documentName: "Project",
                restApi: { methods: [] },
                isolation: [
                    { field: "tenantId", source: "user.tenantId", onMissing: "deny" },
                    { field: "ownerId", source: "user._id", onMissing: "skip" },
                ],
            },
            properties: {
                _id: { type: "string", "x-format": "PrimaryUUID" },
                tenantId: { type: "string" },
                ownerId: { type: "string" },
                title: { type: "string" },
            },
        } as unknown as jsonSchema;

        expect(collectRequestManagedFields(schema, false)).toEqual(
            expect.arrayContaining(["tenantId", "ownerId"]),
        );
    });
});
