// main('../vex.config.json')

import fs from "fs";
import path from "path";
import utils from "~/utils";
import * as types from "~/types/types";

export async function compile(
    compilerOptions: types.compilerOptions
): Promise<void> {
    const scriptsDir = path.join(__dirname, compilerOptions.rootDir, "scripts");
    // read file ./../../templates/root/scripts/build.js
    const template = fs.readFileSync(__dirname+"/templates/root/scripts/build.js", "utf8");
    
    // replace main(...) with main('../vex.config.json')
    const vexConfigPath = utils.common.relativePath(scriptsDir, __dirname+"/vex.config.json");
    const output = template.replace("<<__vexConfigPath__>>", vexConfigPath);

    console.log({
        scriptsDir,
        vexConfigPath
    });
    
    utils.common.writeFile("Controller",
        path.join(compilerOptions.rootDir, "scripts/build.js"),
        output
    );
}