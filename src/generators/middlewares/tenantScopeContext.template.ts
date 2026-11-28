import * as types from "../../types/types";

/**
 * Emits `TenantScopeContext.gen.ts` for one isolation mode.
 *
 * The mode is fixed by `vex.config.tenant.IsolationMode` at generation time, so the emitted file
 * carries only the branch that mode can reach: no mode argument, no unreachable error code.
 *
 * Only "is there a token yet" stays runtime-dependent. `preSelect` reads the header on its single
 * L0 pass. `option` reads the claim when a token is present and falls back to the header for
 * guests. `single` reads the claim and nothing else: a token is the only source, so a guest request
 * has no tenant, and the `x-tenant-id` header is never consulted — a caller cannot pick a tenant by
 * sending one.
 */
export default function tenantScopeContextTemplate(mode: types.TenantIsolationMode): string {
    const tenantErrors = mode === "preSelect"
        ? `    | "missing-header"
    | "invalid-tenant";`
        : mode === "option"
            ? `    | "missing-claim"
    | "invalid-claim"
    | "invalid-tenant";`
            : `    | "missing-claim"
    | "invalid-claim";`;

    const decisionBody = mode === "preSelect"
        ? `
    if (!headerTenantId) return { error: "missing-header" };
    if (!isTenantId(headerTenantId)) return { error: "invalid-tenant" };
    return { tenantId: headerTenantId };`
        : mode === "option"
            ? `
    if (tokenData) {
        const claimed = tokenData.tenantId;
        if (claimed === undefined || claimed === "") return { error: "missing-claim" };
        if (!isTenantId(claimed)) return { error: "invalid-claim" };
        return { tenantId: claimed };
    }

    if (!headerTenantId) return {};
    if (!isTenantId(headerTenantId)) return { error: "invalid-tenant" };
    return { tenantId: headerTenantId };`
            : `
    if (!tokenData) return {};

    const claimed = tokenData.tenantId;
    if (claimed === undefined || claimed === "") return { error: "missing-claim" };
    if (!isTenantId(claimed)) return { error: "invalid-claim" };
    return { tenantId: claimed };`;

    const signature = mode === "preSelect"
        ? `export function resolveTenantContext(
    headerTenantId: string | undefined,
): TenantDecision {`
        : mode === "option"
            ? `export function resolveTenantContext(
    tokenData: Record<string, unknown> | undefined,
    headerTenantId: string | undefined,
): TenantDecision {`
            : `export function resolveTenantContext(
    tokenData: Record<string, unknown> | undefined,
): TenantDecision {`;

    const doc = mode === "preSelect"
        ? ` * \`preSelect\` — the app build is bound to one tenant: the header is required and is the only
 * source. No token exists on the pass that calls this.`
        : mode === "option"
            ? ` * \`option\` — the user logs in first and then selects a tenant. A token that carries the
 * \`tenantId\` claim decides; a token without one is rejected. A request with no token is a
 * guest, and the header identifies the tenant for public endpoints.`
            : ` * \`single\` — one account belongs to one tenant, resolved at login. A token must carry the
 * \`tenantId\` claim. A request with no token is a guest with no tenant: the header is not a
 * source, so a caller cannot pick a tenant.`;

    return `// {{headerComment}}

export type TenantError =
${tenantErrors}

export interface TenantDecision {
    tenantId?: string;
    error?: TenantError;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tenant ids are UUIDs everywhere: the tenant table and the token claim. */
export function isTenantId(value: unknown): value is string {
    return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Decide the tenant of a request.
 *
${doc}
 */
${signature}${decisionBody}
}
`;
}
