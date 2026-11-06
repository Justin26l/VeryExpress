import fs from "fs";
import path from "path";

import utils from "~/utils";
import * as types from "~/types/types";
import { isTenantEnabled } from "~/utils/generator";

/**
 * Generates TenantScopeContext.gen.ts — the pure tenant decision function.
 *
 * The source lives in `src/templates/_tenant/` because it must be emitted only when the
 * feature is on; the regular `_middlewares` copy would ship it to every app.
 */
export async function compile(options: {
    compilerOptions: types.compilerOptions;
    middlewareDir: string;
}): Promise<void> {
    if (!isTenantEnabled(options.compilerOptions)) return;

    const source = fs.readFileSync(
        path.join(__dirname, "templates", "_tenant", "TenantScopeContext.ts"),
        "utf8",
    );

    const outPath = `${options.middlewareDir}/TenantScopeContext.gen.ts`;
    utils.common.writeFile("Tenant Scope Context", outPath, utils.template.format(source));
}

export default { compile };
