import path from "path";

import serverTemplate from "./server.template";
import utils from "../../utils";
import * as types from "../../types/types";

/**
 * generate required files at root & output directory
 * @param compilerOptions 
 */
export async function compile(
    compilerOptions: types.compilerOptions
): Promise<void> {

    const serverOutPath = path.posix.join(compilerOptions.srcDir, "server.ts");

    // write server file
    utils.common.writeFile(
        "Server",
        serverOutPath,
        serverTemplate({
            compilerOptions: compilerOptions,
        })
    );

    return;
}
