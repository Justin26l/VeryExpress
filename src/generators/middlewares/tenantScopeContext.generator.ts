import utils from "~/utils";
import * as types from "~/types/types";
import { isTenantEnabled, tenantIsolationMode } from "~/utils/generator";

import tenantScopeContextTemplate from "./tenantScopeContext.template";

/**
 * Generates TenantScopeContext.gen.ts — the pure tenant decision function.
 *
 * Runs only when the feature is on; the regular `_middlewares` copy would ship it to every app.
 * The mode is baked in at generation time, so the emitted file holds one mode's branch only.
 */
export async function compile(options: {
    compilerOptions: types.compilerOptions;
    middlewareDir: string;
}): Promise<void> {
    if (!isTenantEnabled(options.compilerOptions)) return;

    const source = tenantScopeContextTemplate(tenantIsolationMode(options.compilerOptions));

    const outPath = `${options.middlewareDir}/TenantScopeContext.gen.ts`;
    utils.common.writeFile("Tenant Scope Context", outPath, utils.template.format(source));
}

export default { compile };
