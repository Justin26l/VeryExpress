// {{headerComment}}

export type TenantIsolationMode = "preSelect" | "option";

export type TenantError =
    | "missing-header"
    | "invalid-tenant"
    | "missing-claim"
    | "invalid-claim";

export interface TenantDecision {
    tenantId?: string;
    error?: TenantError;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tenant ids are UUIDs everywhere: header, claim and the UserTenant table. */
export function isTenantId(value: unknown): value is string {
    return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Decide the tenant of a request.
 *
 * `preSelect` — the app build is bound to one tenant: the header is required and is the only
 * source; a token claim is not used.
 *
 * `option` — the user logs in first and then selects a tenant. A token that carries the
 * `tenantId` claim decides; a token without one is rejected. A request with no token is a
 * guest, and the header identifies the tenant for public endpoints.
 *
 * `tokenData` is absent on the L0 pass because authentication has not run yet.
 */
export function resolveTenantContext(
    mode: TenantIsolationMode,
    tokenData: Record<string, unknown> | undefined,
    headerTenantId: string | undefined,
): TenantDecision {
    if (mode === "preSelect") {
        if (!headerTenantId) return { error: "missing-header" };
        if (!isTenantId(headerTenantId)) return { error: "invalid-tenant" };
        return { tenantId: headerTenantId };
    }

    if (tokenData) {
        const claimed = tokenData.tenantId;
        if (claimed === undefined || claimed === "") return { error: "missing-claim" };
        if (!isTenantId(claimed)) return { error: "invalid-claim" };
        return { tenantId: claimed };
    }

    if (!headerTenantId) return {};
    if (!isTenantId(headerTenantId)) return { error: "invalid-tenant" };
    return { tenantId: headerTenantId };
}
