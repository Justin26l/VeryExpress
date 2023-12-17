import fs from "fs";

import templates from "../templates";

import * as types from "../types/types";

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
    console.log('\x1b[32m%s\x1b[0m', '[Writing]', `Server : ${serverOutPath}`);
    fs.writeFileSync(outDir + '/server.ts',
        templates.serverTemplate({
            options: options,
        })
    );

    // write .env file
    console.log('\x1b[32m%s\x1b[0m', '[Writing]', `Server : ${envOutPath}`);
    fs.writeFileSync(`${outDir}/.env`,
        `# veryExpress generated
VERYEXPRESS_PORT=3000
`
    );

    // write git ignore
    console.log('\x1b[32m%s\x1b[0m', '[Writing]', `Server : ${gitignoreOutPath}`);
    fs.writeFileSync(`${outDir}/.env`,
        `# veryExpress generated
node_modules
dist
*.gen.ts
`
    );

    // write package.json
    // console.log('\x1b[32m%s\x1b[0m', '[Writing]', `Server : ${outDir}/package.json`);
    // fs.writeFileSync(`${outDir}/package.json`,
    // '123'
    // );


};
