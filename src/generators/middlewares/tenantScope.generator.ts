import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { isTenantEnabled, tenantIsolationMode } from "~/utils/generator";

/**
 * Generates TenantScope.gen.ts — the middleware that resolves the tenant.
 *
 * The mode is fixed by config at generation time, so each mode gets only its own code:
 *
 * - `preSelect`: one pass at L0, header required, missing/invalid → 400.
 * - `option`: two passes. L0 treats the request as a guest with a header fallback; generated
 *   controllers run it again after authentication, where the token claim decides.
 * - `single`: two passes, claim only. The header is never read, so a caller cannot choose a tenant
 *   by sending one; a guest has no tenant and a token without the claim is a 401.
 *
 * `tenant.scope` narrows the paths it applies to; omitted, it applies to every route.
 *
 * Emitted only when `vex.config.tenant.enable` is true.
 */
export async function compile(options: {
    compilerOptions: types.compilerOptions;
    middlewareDir: string;
}): Promise<void> {
    if (!isTenantEnabled(options.compilerOptions)) return;

    log.process("Tenant Scope Middleware");

    const mode = tenantIsolationMode(options.compilerOptions);
    const scope = options.compilerOptions.tenant?.scope;

    const scopeSource = scope
        ? `const TENANT_SCOPE = ${JSON.stringify(scope)};

function inTenantScope(path: string): boolean {
    return TENANT_SCOPE.some(prefix =>
        path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : \`\${prefix}/\`));
}`
        : "";

    const scopeGuard = scope
        ? `        if (!inTenantScope(req.path)) {
            next();
            return;
        }

`
        : "";

    const headerConstant = mode === "preSelect" || mode === "option"
        ? `const TENANT_HEADER = "x-tenant-id";`
        : "";

    const errorBody = mode === "preSelect"
        ? `    case "missing-header":
        return new VexResErr(400, undefined, "x-tenant-id header is required");
    case "invalid-tenant":
        return new VexResErr(400, undefined, "x-tenant-id must be a UUID");`
        : mode === "option"
            ? `    case "invalid-tenant":
        return new VexResErr(400, undefined, "x-tenant-id must be a UUID");
    case "missing-claim":
        return new VexResErr(401, undefined, "tenant not selected");
    case "invalid-claim":
        return new VexResErr(401, undefined, "invalid tenant claim");`
            : `    case "missing-claim":
        return new VexResErr(401, undefined, "tenant not selected");
    case "invalid-claim":
        return new VexResErr(401, undefined, "invalid tenant claim");`;

    const readHeader = mode === "preSelect" || mode === "option"
        ? `        const raw = req.headers[TENANT_HEADER];
        const value = Array.isArray(raw) ? raw[0] : raw;
        const headerTenantId = value?.trim() || undefined;
`
        : "";

    const storeRead = mode === "preSelect" ? "" : `        const store = UserContext.getStore();\n`;

    const resolveCall = mode === "preSelect"
        ? `        const decision = resolveTenantContext(headerTenantId);`
        : mode === "option"
            ? `        const decision = resolveTenantContext(
            store?.tokenData,
            headerTenantId,
        );`
            : `        const decision = resolveTenantContext(store?.tokenData);`;

    const runContext = mode === "preSelect"
        ? `        UserContext.run({ requestedTenantId: headerTenantId, tenantId: decision.tenantId }, () => next());`
        : mode === "option"
            ? `        const requestedTenantId = headerTenantId ?? store?.requestedTenantId;
        UserContext.run({ requestedTenantId, tenantId: decision.tenantId }, () => next());`
            : `        UserContext.run({ tenantId: decision.tenantId }, () => next());`;

    const classDoc = mode === "preSelect"
        ? ` * One pass at L0. The header is required and is the only source; there is no token yet.
 * It also records \`requestedTenantId\`, which registration uses to link the new account.`
        : mode === "option"
            ? ` * In \`option\` mode this runs once at L0 (guest fallback) and once after
 * \`Authentication.middleware\` (token claim). The later pass overwrites the earlier one.`
            : ` * In \`single\` mode this runs once at L0 (no token yet, so no tenant) and once after
 * \`Authentication.middleware\`, where the claim decides. The header is never read: the token is
 * the only source of a tenant.`;

    const healthComment = mode === "single"
        ? "        // framework health check: there is no tenant to resolve here"
        : "        // framework health check: a load balancer has no tenant header";

    const source = `// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import UserContext from "./UserContext.gen";
import { resolveTenantContext, TenantError } from "./TenantScopeContext.gen";
import { VexResErr } from "../_types/vex";

${headerConstant}${headerConstant ? "\n" : ""}${scopeSource}${scopeSource ? "\n" : ""}function errorOf(error: TenantError): VexResErr {
    switch (error) {
${errorBody}
    }
}

/**
 * Request tenant.
 *
${classDoc}
 */
class TenantScope {
    public middleware = (req: Request, _res: Response, next: NextFunction): void => {
${scopeGuard}${healthComment}
        if (req.path === "/hello") {
            next();
            return;
        }

${readHeader}${storeRead}
${resolveCall}

        if (decision.error) {
            next(errorOf(decision.error));
            return;
        }

${runContext}
    };
}

export default new TenantScope();
`;

    const outPath = `${options.middlewareDir}/TenantScope.gen.ts`;
    utils.common.writeFile("Tenant Scope Middleware", outPath, utils.template.format(source));
}

export default { compile };
