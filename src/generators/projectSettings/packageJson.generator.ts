import fs from "fs";

import packageJsonTemplate from "./../../templates/_projectSettings/package.json";

import utils from "./../../utils";
import log from "./../../utils/logger";

import * as types from "./../../types/types";

export async function compile(
    packageOutPath: string,
    // compilerOptions: types.compilerOptions
): Promise<void> {
    // read package.json and add script section
    log.process(`Project Settings : ${packageOutPath}`);
    let packjson: string = "";

    if (!fs.existsSync(packageOutPath)) {
        packjson = JSON.stringify(packageJsonTemplate);
    }
    else {
        packjson = fs.readFileSync(packageOutPath).toString();
    }

    const packageJson = JSON.parse(packjson);

    // Always overwrite scripts — tsoa spec-and-routes must run before tsc/nodemon
    const templateScripts = Object.keys(packageJsonTemplate.scripts);
    templateScripts.forEach((name) => {
        // @ts-expect-error ts sometime just a bitch yelling "oh you cant do this~ its unsafe~"
        packageJson.scripts[name] = packageJsonTemplate.scripts[name];
    });
    log.process("package.json : scripts synced from template");


    // compare loaded packageJson with template, if there are missing packages in loaded packageJson, add them from template
    for (const [key, value] of Object.entries(packageJsonTemplate.dependencies)) {
        if (!packageJson.dependencies[key]) {
            log.process(`package.json : Add dependency : ${key} > ${value}`);
            packageJson.dependencies[key] = value;
        }
    }
    for (const [key, value] of Object.entries(packageJsonTemplate.devDependencies)) {
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