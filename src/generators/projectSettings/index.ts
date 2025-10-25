import * as path from "path";
import * as types from "~/types/types";

import packageJson from "./packageJson.generator";
import buildScripts from "./buildScripts.generator";
import environment from "./environment.generator";

export function compile(compilerOptions: types.compilerOptions): void {

    const packageOutPath = path.posix.join(compilerOptions.rootDir, "package.json");
    const envOutPath = path.posix.join(compilerOptions.rootDir, ".env");

    // process package.json
    buildScripts.compile(compilerOptions);

    // process package.json
    packageJson.compile(packageOutPath, compilerOptions);
    
    // process .env
    environment.compile(envOutPath);

}