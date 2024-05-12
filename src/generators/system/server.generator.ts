import fs from "fs";

import serverTemplate from "./server.template";
import packageJson from "../project/packageJson.generator";

import * as types from "../../types/types";
import log from "../../utils/logger";
import { writeFile } from "../../utils";

import envtemplate from "../../templates/root/.env";
/**
 * generate required files at root & output directory
 * @param compilerOptions 
 */
export function compile(
    compilerOptions: types.compilerOptions
): void {

    const serverOutPath = compilerOptions.srcDir + "/server.ts";
    const packageOutPath = compilerOptions.rootDir + "/package.json";
    const envOutPath = compilerOptions.rootDir + "/.env";
    const tsconfigOutPath = compilerOptions.rootDir + "/tsconfig.json";

    // write server file
    writeFile(
        "Server",
        serverOutPath,
        serverTemplate({
            compilerOptions: compilerOptions,
        })
    );

    // write .env
    if (!fs.existsSync(envOutPath)) {
        log.writing(`Project : ${envOutPath}`);
        fs.copyFileSync(envtemplate, envOutPath);
    }

    // write tsconfig.json
    if (!fs.existsSync(tsconfigOutPath)) {
        // try {
        log.writing(`Project : ${tsconfigOutPath}`);
        fs.copyFileSync("./../../templates/root/tsconfig.json", tsconfigOutPath);
        //     childProcess.execSync('tsc --init', { cwd: '.', stdio: 'inherit' });
        // } catch (error) {
        //     log.error('Failed to execute command: tsc --init');
        // }
    }

    // process package.json
    packageJson.compile(packageOutPath, compilerOptions);

}
