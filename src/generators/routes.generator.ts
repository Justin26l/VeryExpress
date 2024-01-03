import fs from "fs";

import routesTemplate from "./routes.template";

import * as types from "../types/types";
import log from "../utils/log";

/**
 * compile controllers to route source code
 * @param openapiPath
 * @param controllerToModelDir
 * @param outputPath
 * @param options
 */
export function compile(
    routesArr: {
        route: string,
        controllerClassName: string,
        controllerPath: string,
    }[],
    openapiPath: string,
    outPath: string,
    options?: types.compilerOptions
): void {

    log.writing(`Router : ${outPath}`);
    // rewrite routes file
    fs.writeFileSync(outPath, 
        routesTemplate({
            routes: routesArr,
            openapiPath: openapiPath,
            options: options,
        })
    );

};
