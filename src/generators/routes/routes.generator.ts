import fs from "fs";

import routesTemplate from "./routes.template";
import * as routesOAuthGen from "./oauth.generator";
import * as routesSwaggerGen from "./swagger.generator";

import * as types from "../../types/types";

import * as utilsGenerator from "../../utils/generator";
import log from "../../utils/logger";
import { writeFile } from "../../utils";

/**
 * compile controllers to route source code
 * @param routesArr
 * @param routesDir output directory of routes
 * @param options
 */
export function compile(options: {
    routesArr: {
        route: string,
        interfaceName: string,
        controllerPath: string,
    }[],
    routesDir: string,
    openapiFile: string,
    compilerOptions: types.compilerOptions
}): void {

    log.process("Route");
    
    const routesApiOutPath: string = `${options.routesDir}/ApiRouter.gen.ts`;
    const routesOAuthOutPath: string = `${options.routesDir}/OAuthRouter.gen.ts`;
    const routesSwaggerOutPath: string = `${options.routesDir}/SwaggerRouter.gen.ts`;

    // use oauth
    if ( utilsGenerator.isUseOAuth(options.compilerOptions).length > 0 ) {
        writeFile(
            "Route OAuth", 
            routesOAuthOutPath,
            routesOAuthGen.compile(options.compilerOptions)
        );
    }

    // use swagger
    if (options.compilerOptions.app.enableSwagger) {
        writeFile(
            "Route Swagger", 
            routesSwaggerOutPath, 
            routesSwaggerGen.compile(options.compilerOptions)
        );
    }

    // write json schema api routes
    writeFile(
        "Route API", 
        routesApiOutPath, 
        routesTemplate({
            routes: options.routesArr,
            openapiFile: options.openapiFile,
            compilerOptions: options.compilerOptions,
        })
    );

}
