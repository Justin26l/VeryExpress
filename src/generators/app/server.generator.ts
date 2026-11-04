import path from "path";

import serverTemplate from "./server.template";
import utils from "../../utils";
import * as types from "../../types/types";

export async function compile(
    compilerOptions: types.compilerOptions
): Promise<void> {

    const serverOutPath = path.posix.join(compilerOptions.srcDir, "server.ts");

    utils.common.writeFile(
        "Server",
        serverOutPath,
        serverTemplate({
            compilerOptions: compilerOptions,
        })
    );

    return;
}
