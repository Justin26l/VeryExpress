import fs from "fs";
import childProcess from 'child_process';

import serverTemplate from "./server.template";
import packageJson from "./packageJson.generator";

import * as types from "../types/types";
import log from "../utils/log";

/**
 * generate required files at root & output directory
 * @param outDir 
 * @param jsonSchemaDir
 * @param openapiDir
 * @param options 
 */
export function compile(
    schemaDir: string,
    openapiDir: string,
    outDir: string,
    options?: types.compilerOptions
): void {

    const serverOutPath = `${outDir}/server.ts`;
    const packageOutPath = `./package.json`;
    const envOutPath = `./.env`;
    const tsconfigOutPath = `./tsconfig.json`;
    const gitignoreOutPath = `./.gitignore`;

    // write server file
    if (!fs.existsSync(serverOutPath)) {
        log.writing(`Server : ${serverOutPath}`);
        fs.writeFileSync(outDir + '/server.ts',
            serverTemplate({
                options: options,
            })
        );
    }

    // write .env
    if (!fs.existsSync(envOutPath)) {
        log.writing(`Project : ${envOutPath}`);
        fs.copyFileSync(__dirname + '/../templates/root/.env', envOutPath);
    };

    // write tsconfig.json
    if (!fs.existsSync(tsconfigOutPath)) {
        // try {
            log.writing(`Project : ${tsconfigOutPath}`);
            fs.copyFileSync(__dirname + '/../templates/root/tsconfig.json', tsconfigOutPath);
        //     childProcess.execSync('tsc --init', { cwd: '.', stdio: 'inherit' });
        // } catch (error) {
        //     log.error('Failed to execute command: tsc --init');
        // }
    };

    // process package.json
    packageJson.compile(packageOutPath, schemaDir, openapiDir, outDir);

};
