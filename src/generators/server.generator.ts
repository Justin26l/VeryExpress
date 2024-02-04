import fs from "fs";

import serverTemplate from "./server.template";
import packageJson from "./packageJson.generator";

import * as types from "../types/types";
import log from "../utils/log";

/**
 * generate required files at root & output directory
 * @param jsonSchemaDir
 * @param outDir 
 * @param options 
 */
export function compile(
    schemaDir: string,
    outDir: string,
    srcDir: string,
    options?: types.compilerOptions
): void {

    const serverOutPath = `${srcDir}/server.ts`;
    const envOutPath = `${outDir}/.env`;
    const packageOutPath = `${outDir}/package.json`;
    const tsconfigOutPath = `${outDir}/tsconfig.json`;
    // const gitignoreOutPath = `./.gitignore`;

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
        log.writing(`Project : ${tsconfigOutPath}`);
        fs.copyFileSync(__dirname + '/../templates/root/tsconfig.json', tsconfigOutPath);
    };

    // process package.json
    packageJson.compile(packageOutPath, schemaDir, outDir);

};