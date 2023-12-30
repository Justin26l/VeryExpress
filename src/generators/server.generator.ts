import fs from "fs";
import childProcess from'child_process';

import serverTemplate from "./server.template";

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
    const packageOutPath = `${outDir}/package.json`;
    const envOutPath = `${outDir}/.env`;
    const tsconfigOutPath = `${outDir}/tsconfig.json`;
    const gitignoreOutPath = `${outDir}/.gitignore`;

    // write server file
    log.writing(`Server : ${serverOutPath}`);
    fs.writeFileSync(outDir + '/server.ts',
        serverTemplate({
            options: options,
        })
    );

    // read package.json and add script section
    log.writing(`Project : ${packageOutPath}`);
    let packjson :string = '';
    if (! fs.existsSync(packageOutPath)) {
        packjson = fs.readFileSync(__dirname + '/../templates/root/package.json').toString();
    }
    else{
        packjson = fs.readFileSync(packageOutPath).toString();
    }
    const packageJson = JSON.parse(packjson);
    packageJson['scripts'] = {
        "vex-gen"   : `vex -j ${schemaDir} -a ${openapiDir} -o ${outDir}`,
        "build"     : "tsc -p .",
        "dev"       : `nodemon --watch src --exec ts-node ${outDir}/server.ts`,
        "start"     : "node ./dist/server.js",
    };
    fs.writeFileSync(packageOutPath, JSON.stringify(packageJson, null, 4));

    // write tsconfig.json
    if(! fs.existsSync(tsconfigOutPath)) {
        try {
            log.writing(`Project : ${tsconfigOutPath}`);
            childProcess.execSync('tsc --init', { cwd: outDir, stdio: 'inherit' });
        } catch (error) {
            log.error('Error on command: tsc --init');
        }
    };
    
    // write .env
    if(! fs.existsSync(envOutPath)) {
        log.writing(`Project : ${envOutPath}`);
        fs.copyFileSync(__dirname + '/../templates/root/.env', envOutPath);
    };

};
