import { describe, expect, it } from "vitest";

import { isTenantId, resolveTenantContext } from "../../src/templates/_tenant/TenantScopeContext";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

describe("isTenantId", () => {
    it("accepts a UUID", () => {
        expect(isTenantId(TENANT_A)).toBe(true);
    });

    it("rejects a non-UUID and a non-string", () => {
        expect(isTenantId("acme")).toBe(false);
        expect(isTenantId(42)).toBe(false);
        expect(isTenantId(undefined)).toBe(false);
    });
});

describe("resolveTenantContext — preSelect", () => {
    it("uses the header", () => {
        expect(resolveTenantContext("preSelect", undefined, TENANT_A)).toEqual({ tenantId: TENANT_A });
    });

    it("requires the header", () => {
        expect(resolveTenantContext("preSelect", { tenantId: TENANT_B }, undefined)).toEqual({ error: "missing-header" });
    });

    it("rejects a header that is not a UUID", () => {
        expect(resolveTenantContext("preSelect", undefined, "acme")).toEqual({ error: "invalid-tenant" });
    });

    it("ignores a token claim — the header is the space", () => {
        expect(resolveTenantContext("preSelect", { tenantId: TENANT_B }, TENANT_A)).toEqual({ tenantId: TENANT_A });
    });
});

describe("resolveTenantContext — option", () => {
    it("uses the token claim", () => {
        expect(resolveTenantContext("option", { tenantId: TENANT_A }, TENANT_B)).toEqual({ tenantId: TENANT_A });
        expect(resolveTenantContext("option", { tenantId: TENANT_A }, undefined)).toEqual({ tenantId: TENANT_A });
    });

    it("rejects an authenticated request whose token has no claim", () => {
        expect(resolveTenantContext("option", { vexUserId: "u-1" }, TENANT_A)).toEqual({ error: "missing-claim" });
        expect(resolveTenantContext("option", { tenantId: "" }, undefined)).toEqual({ error: "missing-claim" });
    });

    it("rejects a claim that is not a UUID", () => {
        expect(resolveTenantContext("option", { tenantId: "acme" }, undefined)).toEqual({ error: "invalid-claim" });
    });

    it("falls back to the header for a guest", () => {
        expect(resolveTenantContext("option", undefined, TENANT_A)).toEqual({ tenantId: TENANT_A });
    });

    it("rejects a guest header that is not a UUID", () => {
        expect(resolveTenantContext("option", undefined, "acme")).toEqual({ error: "invalid-tenant" });
    });

    it("has no tenant for a guest with no header", () => {
        expect(resolveTenantContext("option", undefined, undefined)).toEqual({});
    });
});
