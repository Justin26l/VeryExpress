import fs from "fs";

import routesTemplate from "./routes.template";
import * as routesOAuthGen from "./routes/oauth.generator";

import * as types from "../types/types";

import * as utils from "../utils/common";
import log from "../utils/logger";

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

    const routesApiOutPath: string = `${options.routesDir}/ApiRouter.gen.ts`;
    const routesOAuthOutPath: string = `${options.routesDir}/OAuthRouter.gen.ts`;
    const routesSwaggerOutPath: string = `${options.routesDir}/SwaggerRouter.gen.ts`;
    log.writing(`Router : ${routesApiOutPath}`);

    // write json schema api routes
    fs.writeFileSync(routesApiOutPath, 
        routesTemplate({
            routes: options.routesArr,
            openapiFile: options.openapiFile,
            compilerOptions: options.compilerOptions,
        })
    );

    // use oauth
    if ( utils.isUseOAuth(options.compilerOptions).length > 0 ) {
        fs.writeFileSync(routesOAuthOutPath,
            routesOAuthGen.compile({
                compilerOptions: options.compilerOptions || utils.defaultCompilerOptions
            })
        );
    }

    // use swagger
    if (options.compilerOptions.enableSwagger) {
        fs.copyFileSync(`${__dirname}/../templates/routes/swagger.gen.ts`, routesSwaggerOutPath);
    }

}
