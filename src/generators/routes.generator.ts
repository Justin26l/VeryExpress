import fs from "fs";

import routesTemplate from "./routes.template";

import * as types from "../types/types";
import log from "../utils/log";

/**
 * compile controllers to route source code
 * @param routesArr
 * @param routesOutPath output directory file
 * @param options
 */
export function compile(options: {
    routesArr: {
        route: string,
        controllerClassName: string,
        controllerPath: string,
    }[],
    routesOutPath: string,
    openapiFile: string,
    compilerOptions: types.compilerOptions
}): void {

    log.writing(`Router : ${options.routesOutPath}`);
    // rewrite routes file
    fs.writeFileSync(options.routesOutPath, 
        routesTemplate({
            routes: options.routesArr,
            openapiFile: options.openapiFile,
            compilerOptions: options.compilerOptions,
        })
    );

}
