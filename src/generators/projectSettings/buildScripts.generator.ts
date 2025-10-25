// main('../vex.config.json')

import fs from "fs";
import path from "path";
import utils from "~/utils";
import * as types from "~/types/types";

export async function compile(
    compilerOptions: types.compilerOptions
): Promise<void> {
    // read file templates/root/scripts/build.js
    let template = fs.readFileSync(__dirname+"/templates/root/scripts/build.js", "utf8");

    // populate openapiDir
    const openapiDir = utils.common.relativePath(compilerOptions.rootDir, compilerOptions.openapiDir);
    template = template.replace("{{openapiDir}}", openapiDir);
    
    utils.common.writeFile("Build Scripts",
        path.join(compilerOptions.rootDir, "scripts/build.js"),
        template
    );
}

export default {
    compile
};