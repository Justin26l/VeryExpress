import routesTemplate from "./routes.template";
import * as routesOAuthGen from "./oauth.generator";
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
    const routesOAuthOutPath: string = `${options.routesDir}/OAuthRouter.gen.ts`;
    const routesSwaggerOutPath: string = `${options.routesDir}/SwaggerRouter.gen.ts`;

    // use oauth
    if ( utils.generator.isUseOAuth(options.compilerOptions).length > 0 ) {
        utils.common.writeFile(
            "Route OAuth", 
            routesOAuthOutPath,
            routesOAuthGen.compile(options.compilerOptions)
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
