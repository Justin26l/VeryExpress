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
        envOutput = fs.readFileSync(envOutPath, "utf-8");
        const existingEnvProps: string[] = [];
        const templateEnvProps : string[] = [];
        const newProps: string[] = [];

        envOutput.split("\n").forEach((line) => {
            if(!/=/g.test(line)) return;
            const key = line.split("=",2)[0];
            if(key) existingEnvProps.push(key);
        });

        envTemplate.split("\n").forEach((line) => {
            if(!/=/g.test(line)) return;
            const key = line.split("=",2)[0];
            if(key) templateEnvProps.push(key);
        });

        // find missing props
        templateEnvProps.forEach(key => {
            if(!existingEnvProps.includes(key)){
                newProps.push(key)
            }
        });

        // add missing props
        if(newProps.length > 0){
            envOutput += `\n\n# New Props from very-express`;
            newProps.forEach(key => {
                envOutput += `\n${key}=`;
            });
        }
    };


    utils.common.writeFile(`Project Settings : ${envOutPath}`, envOutPath, envOutput);

    return;
}

export default {
    compile
};