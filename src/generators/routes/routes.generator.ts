import * as routesAuthGen from "./auth.generator";
import * as routesSwaggerGen from "./swagger.generator";

import * as types from "./../../types/types";
import * as path from "path";

import utils from "./../../utils";
import log from "./../../utils/logger";

/**
 * compile auth & swagger routes (tsoa generates API routes separately)
 */
export async function compile(options: {
    routesDir: string,
    compilerOptions: types.compilerOptions
}): Promise<void> {

    log.process("Route");

    const controllerDir = path.posix.join(options.compilerOptions.sysDir, "_controllers");
    const routesSwaggerOutPath: string = `${options.routesDir}/SwaggerRouter.gen.ts`;

    if (utils.generator.isAuthEnabled(options.compilerOptions)) {
        // AuthController (tsoa) — token, refresh, register, local login at /api/auth/*
        utils.common.writeFile(
            "Route AuthController",
            `${controllerDir}/AuthController.gen.ts`,
            routesAuthGen.compileController(options.compilerOptions)
        );

        // AuthRouter (express) — OAuth passport redirect flows at /auth/<provider>
        if (routesAuthGen.hasOAuthProviders(options.compilerOptions)) {
            utils.common.writeFile(
                "Route AuthRouter",
                `${options.routesDir}/AuthRouter.gen.ts`,
                routesAuthGen.compileRouter(options.compilerOptions)
            );
        }
    }

    // use swagger
    if (options.compilerOptions.app.enableSwagger) {
        utils.common.writeFile(
            "Route Swagger",
            routesSwaggerOutPath,
            routesSwaggerGen.compile()
        );
    }

    return;
}

