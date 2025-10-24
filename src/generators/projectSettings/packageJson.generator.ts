import fs from "fs";

import packangeJsonTemplate from "./../../templates/_projectSettings/package.json";

import utils from "./../../utils";
import log from "./../../utils/logger";

import * as types from "./../../types/types";

export async function compile(
    packageOutPath: string,
    compilerOptions: types.compilerOptions
): Promise<void> {
    // read package.json and add script section
    log.process(`Project Settings : ${packageOutPath}`);
    let packjson: string = "";

    if (!fs.existsSync(packageOutPath)) {
        packjson = JSON.stringify(packangeJsonTemplate);
    }
    else {
        packjson = fs.readFileSync(packageOutPath).toString();
    }

    const packageJson = JSON.parse(packjson);

    if (!packageJson.scripts.build) {
        log.process(`package.json : Update script : build > ${packageJson.scripts.build}`);
        packageJson.scripts.build = "tsc -p . && node scripts/build.js";
    }

    if (!packageJson.scripts.dev) {
        log.process(`package.json : Update script : dev > ${packageJson.scripts.dev}`);
        packageJson.scripts.dev = `nodemon --watch src --exec ts-node ${compilerOptions.srcDir}/server.ts`;
    }

    if (!packageJson.scripts.start) {
        log.process(`package.json : Update script : start > ${packageJson.scripts.start}`);
        packageJson.scripts.start = "node ./dist/server.js";
    }

    utils.common.writeFile(`Project Settings : ${packageOutPath}`, packageOutPath, JSON.stringify(packageJson, null, 4));

    return;
}

export default {
    compile
};