import fs from "fs";
import path from "path";

import utils from "./../../utils";
import log from "./../../utils/logger";

import * as types from "./../../types/types";

export async function compile(
    envOutPath: string,
    compilerOptions: types.compilerOptions
): Promise<void> {
    // read env and add
    log.process(`Project Settings : ${envOutPath}`);
    let envOutput: string = "";
    let envTemplate: string = fs.readFileSync(__dirname+"/templates/_projectSettings/env", "utf8");

    console.log(`Processing .env file at ${envOutPath}`);

    if (!fs.existsSync(envOutPath)) {
        envOutput = envTemplate;
    }
    else {
        const existingEnv = fs.readFileSync(envOutPath, "utf-8");
        const existingEnvMap: { [key: string]: string } = {};
        existingEnv.split("\n").forEach((line) => {
            const [key, ...rest] = line.split("=");
            existingEnvMap[key] = rest.join("=");
        });

        const templateEnvMap: { [key: string]: string } = {};
        envTemplate.split("\n").forEach((line) => {
            const [key, ...rest] = line.split("=")
            key.replace(' ', '');
            templateEnvMap[key] = rest.join("=");
        });

        console.log("Updated .env contents:", existingEnvMap, templateEnvMap);

        // envOutput = Object.entries(existingEnvMap)
        //     .map(([key, value]) => `${key}=${value}`)
        //     .join("\n");
    };

    // utils.common.writeFile(`Project Settings : ${envOutPath}`, envOutPath, envOutput);

    return;
}

export default {
    compile
};