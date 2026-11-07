import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { isTenantEnabled, tenantIsolationMode } from "~/utils/generator";

/**
 * Generates TenantScope.gen.ts — the middleware that resolves the tenant.
 *
 * `preSelect`: one pass, at L0, and a missing/invalid header is a 400.
 * `option`: two passes. L0 treats the request as a guest (header fallback); generated
 * controllers run it again after authentication, where the token claim decides and a token
 * without a claim is a 401.
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

    const source = `// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import UserContext from "./UserContext.gen";
import { resolveTenantContext, TenantError } from "./TenantScopeContext.gen";
import { VexResErr } from "../_types/vex";

const TENANT_HEADER = "x-tenant-id";
const ISOLATION_MODE = ${JSON.stringify(mode)};
${scopeSource}
function errorOf(error: TenantError): VexResErr {
    switch (error) {
    case "missing-header":
        return new VexResErr(400, undefined, "x-tenant-id header is required");
    case "invalid-tenant":
        return new VexResErr(400, undefined, "x-tenant-id must be a UUID");
    case "missing-claim":
        return new VexResErr(401, undefined, "tenant not selected");
    case "invalid-claim":
        return new VexResErr(401, undefined, "invalid tenant claim");
    }
}

/**
 * Request tenant.
 *
 * In \`option\` mode this runs once at L0 (guest fallback) and once after
 * \`Authentication.middleware\` (token claim). The later pass overwrites the earlier one.
 */
class TenantScope {
    public middleware = (req: Request, _res: Response, next: NextFunction): void => {
${scopeGuard}        // framework health check: a load balancer has no tenant header
        if (req.path === "/hello") {
            next();
            return;
        }

        const raw = req.headers[TENANT_HEADER];
        const value = Array.isArray(raw) ? raw[0] : raw;
        const headerTenantId = value?.trim() || undefined;
        const store = UserContext.getStore();

        const decision = resolveTenantContext(
            ISOLATION_MODE,
            store?.tokenData,
            headerTenantId,
        );

        if (decision.error) {
            next(errorOf(decision.error));
            return;
        }

        const requestedTenantId = headerTenantId ?? store?.requestedTenantId;
        UserContext.run({ requestedTenantId, tenantId: decision.tenantId }, () => next());
    };
}

export default new TenantScope();
`;

    const outPath = `${options.middlewareDir}/TenantScope.gen.ts`;
    utils.common.writeFile("Tenant Scope Middleware", outPath, utils.template.format(source));
}

export default { compile };
