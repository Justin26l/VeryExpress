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

    // Always overwrite scripts — tsoa spec-and-routes must run before tsc/nodemon
    packageJson.scripts.build = packangeJsonTemplate.scripts.build;
    packageJson.scripts.dev = packangeJsonTemplate.scripts.dev;
    packageJson.scripts.start = packangeJsonTemplate.scripts.start;
    log.process("package.json : scripts synced from template");


    // compare loaded packageJson with template, if there are missing packages in loaded packageJson, add them from template
    for (const [key, value] of Object.entries(packangeJsonTemplate.dependencies)) {
        if (!packageJson.dependencies[key]) {
            log.process(`package.json : Add dependency : ${key} > ${value}`);
            packageJson.dependencies[key] = value;
        }
    }
    for (const [key, value] of Object.entries(packangeJsonTemplate.devDependencies)) {
        if (!packageJson.devDependencies[key]) {
            log.process(`package.json : Add devDependency : ${key} > ${value}`);
            packageJson.devDependencies[key] = value;
        }
    }

    utils.common.writeFile(`Project Settings : ${packageOutPath}`, packageOutPath, JSON.stringify(packageJson, null, 4));

    return;
}

export default {
    compile
};