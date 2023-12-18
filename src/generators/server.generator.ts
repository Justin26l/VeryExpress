import fs from "fs";

import templates from "../templates";

import * as types from "../types/types";
import log from "../utils/log";

/**
 * write files at root directory
 * - server.ts
 * - .env 
 * @param outDir 
 * @param options 
 */
export function compile(
    outDir: string,
    options?: types.compilerOptions
): void {

    const serverOutPath = `${outDir}/server.ts`;
    const envOutPath = `${outDir}/.env`;
    const gitignoreOutPath = `${outDir}/.gitignore`;

    // write server file
    log.writing(`Server : ${serverOutPath}`);
    fs.writeFileSync(outDir + '/server.ts',
        templates.serverTemplate({
            options: options,
        })
    );

    // write .env file
    log.writing(`Server : ${envOutPath}`);
    fs.writeFileSync(`${outDir}/.env`,
        `# veryExpress generated
VERYEXPRESS_PORT=3000
`
    );

    // write git ignore
    log.writing(`Server : ${gitignoreOutPath}`);
    fs.writeFileSync(`${outDir}/.env`,
        `# veryExpress generated
node_modules
dist
*.gen.ts
`
    );

    // write package.json
    // log.writing(`Server : ${outDir}/package.json`);
    // fs.writeFileSync(`${outDir}/package.json`,
    // '123'
    // );


};
