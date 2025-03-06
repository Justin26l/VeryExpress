import routesTemplate from "./routes.template";
import * as routesAuthGen from "./auth.generator";
import * as routesSwaggerGen from "./swagger.generator";

import * as types from "./../../types/types";

import utils from "./../../utils";
import log from "./../../utils/logger";

/**
 * compile controllers to route source code
 * @param routesArr
 * @param routesDir output directory of routes
 * @param options
 */
export async function compile(options: {
    routesArr: {
        route: string,
        documentName: string,
        controllerPath: string,
    }[],
    routesDir: string,
    openapiFile: string,
    compilerOptions: types.compilerOptions
}): Promise<void> {

    log.process("Route");
    
    const routesApiOutPath: string = `${options.routesDir}/ApiRouter.gen.ts`;
    const routesAuthOutPath: string = `${options.routesDir}/AuthRouter.gen.ts`;
    const routesSwaggerOutPath: string = `${options.routesDir}/SwaggerRouter.gen.ts`;

    // use oauth
    if ( utils.generator.isOAuthEnabled(options.compilerOptions) ) {
        utils.common.writeFile(
            "Route Auth", 
            routesAuthOutPath,
            routesAuthGen.compile(options.compilerOptions)
        );
    }

    // use swagger
    if (options.compilerOptions.app.enableSwagger) {
        utils.common.writeFile(
            "Route Swagger", 
            routesSwaggerOutPath, 
            routesSwaggerGen.compile(options.compilerOptions)
        );
    }

    // write json schema api routes
    utils.common.writeFile(
        "Route API", 
        routesApiOutPath, 
        routesTemplate({
            routes: options.routesArr,
            openapiFile: options.openapiFile,
            compilerOptions: options.compilerOptions,
        })
    );

    return;
}
