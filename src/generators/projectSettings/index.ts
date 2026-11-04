import * as path from "path";
import * as types from "~/types/types";

import packageJson from "./packageJson.generator";
import buildScripts from "./buildScripts.generator";
import environment from "./environment.generator";
import tsoaConfig from "./tsoaConfig.generator";

export function compile(compilerOptions: types.compilerOptions): void {

    const packageOutPath = path.posix.join(compilerOptions.rootDir, "package.json");
    const envOutPath = path.posix.join(compilerOptions.rootDir, ".env");

    buildScripts.compile(compilerOptions);

    packageJson.compile(packageOutPath, compilerOptions);

    environment.compile(envOutPath);

    tsoaConfig.compile(compilerOptions);

}