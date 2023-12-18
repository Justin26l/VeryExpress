import fs from "fs";

import templates from "../templates";

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
        templates.routesTemplate({
            routes: routesArr,
            openapiPath: openapiPath,
            options: options,
        })
    );

};
