// read package.json and get version
import fs from "fs";
import path from "path";
import childProcess from "child_process";
import * as types from "../types/types";
import log from "./logger";

function getPackageInfo(): {
    version: string,
    author: string,
    } {
    let globalPackages: {[key:string]:any} = {};
    // get local npm package dependencies with npm -g list
    try {
        globalPackages = JSON.parse(childProcess.execSync("npm -g list --json",).toString());
    } catch (error) {
        log.error("Failed to read version number, on execute command: npm -g list --json", error);
    }

    return {
        version: globalPackages.dependencies["very-express"].version || "[unknown version]",
        author: globalPackages.author || "justin26l",
    };
}

export function getGenaratorHeaderComment(): string {
    const packageInfo = getPackageInfo();
    return `/**
 * Generated by veryExpress@${packageInfo.version} 
 * https://www.npmjs.com/package/very-express
 * author: ${packageInfo.author}
 */
`;
}

export function getSimpleHeaderComment(): string {
    const packageInfo = getPackageInfo();
    return `// Generated by veryExpress@${packageInfo.version}`;
}

export function isUseOAuth(compilerOptions: types.compilerOptions):string[] {
    return Object.keys(compilerOptions.useOauth).filter((key) => {
        return compilerOptions.useOauth[key] === true;
    });
}

export const defaultCompilerOptions: types.compilerOptions = {
    headerComment: "// generated files by very-express",
    commitBeforeGenerate: false,

    rootDir: ".",
    srcDir: "./src",
    jsonSchemaDir: "./jsonSchema",
    openapiDir: "./openapi",

    
    enableSwagger: true,
    useUserSchema: true,
    useObjectID: true,
    allowApiCreateUpdate_id: false,
    useOauth: {
        google: false,
        microsoft: false,
        apple: false,
        github: false,
    },

};

export default {
    defaultCompilerOptions,
    getGenaratorHeaderComment,
    getSimpleHeaderComment,
    isUseOAuth,
};