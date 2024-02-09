import fs from "fs";

import serverTemplate from "./server.template";
import packageJson from "./packageJson.generator";

import * as types from "../types/types";
import log from "../utils/log";

/**
 * generate required files at root & output directory
 * @param options 
 */
export function compile(
    options: types.compilerOptions
): void {

    const serverOutPath = options.srcDir + "/server.gen.ts";
    const packageOutPath = options.rootDir + "/package.json";
    const envOutPath = options.rootDir + "/.env";
    const tsconfigOutPath = options.rootDir + "/tsconfig.json";
    // const gitignoreOutPath = options.rootDir +  ".gitignore";

    // write server file
    fs.writeFileSync(serverOutPath,
        serverTemplate({
            options: options,
        })
    );

    // write .env
    if (!fs.existsSync(envOutPath)) {
        log.writing(`Project : ${envOutPath}`);
        fs.copyFileSync(__dirname + "/../templates/root/.env", envOutPath);
    }

    // write tsconfig.json
    if (!fs.existsSync(tsconfigOutPath)) {
        // try {
        log.writing(`Project : ${tsconfigOutPath}`);
        fs.copyFileSync(__dirname + "/../templates/root/tsconfig.json", tsconfigOutPath);
        //     childProcess.execSync('tsc --init', { cwd: '.', stdio: 'inherit' });
        // } catch (error) {
        //     log.error('Failed to execute command: tsc --init');
        // }
    }

    // process package.json
    packageJson.compile(packageOutPath, options.jsonSchemaDir, options.rootDir);

}
