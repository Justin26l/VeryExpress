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

export function getGenaratorHeaderComment(comment?: string): string {
    const packageInfo = getPackageInfo();
    return `/* eslint-disable */
/**
 * Generated by veryExpress@${packageInfo.version} 
 * https://www.npmjs.com/package/very-express
 * author: ${packageInfo.author}
 * 
 * Not recommended to modify it manually because it will be overwritten while re-generate.
 */
`;
}

export function getSimpleHeaderComment(): string {
    const packageInfo = getPackageInfo();
    return `// Generated by veryExpress@${packageInfo.version}`;
}

export const relativePath = (fromPath: string, toPath: string): string => {
    return path.relative(fromPath, toPath).replace(/\\/g, "/");
};

export function loadJsonSchema(jsonSchemaPath: string) : types.jsonSchema | never {

    if(!fs.existsSync(jsonSchemaPath)){
        return log.error(`loadJsonSchema : File Not Found ${jsonSchemaPath}`);
    }

    try {
        return JSON.parse(fs.readFileSync(jsonSchemaPath, "utf8")) as types.jsonSchema;
    }
    catch (e: any) {
        return log.error("Error Load JsonSchema File :\n", e.message || e, jsonSchemaPath);
    }
}

export function cleanXcustomValue(
    schemaObj: { [key: string]: any },
    additionalKeyArr?: string[] | types.additionalKeyObj
): { [key: string]: any } {
    // clone obj but avoid Object.assign cuz it parsed "Array [ a, b ]" to "number index object { 0:a, 1:b }"
    const obj = JSON.parse(JSON.stringify(schemaObj));
    
    const isAddiArrStr: boolean = Array.isArray(additionalKeyArr);

    const addiArrStr: string[] = isAddiArrStr ? additionalKeyArr as string[] : [];
    const addiArrObj: types.additionalKeyObj = !isAddiArrStr ? additionalKeyArr as types.additionalKeyObj : {};

    // filtr out key start with 'x-' and additionalKeyArr recursively
    for (const key in obj) {
        if (key.startsWith("x-")) {
            delete obj[key];
        }
        // additionalKeyArr is array, filter with fields name only
        else if ( isAddiArrStr && addiArrStr.includes(key) ) {
            delete obj[key];
        }
        // additionalKeyArr is object, filter with type
        else if ( !isAddiArrStr && typeof addiArrObj[key] !== "undefined" && addiArrObj[key] == typeof obj[key]  ) {
            delete obj[key];
        }
        else if (typeof obj[key] === "object") {
            obj[key] = cleanXcustomValue(obj[key], additionalKeyArr);
        }
    }

    return obj;
}

/** filter "getList" which not a http method */
export function httpMethod(jsonSchemaMethod: string, documentName: string) : types.httpMethod {
    if (jsonSchemaMethod == "getList"){ 
        return "get";
    }
    else if (types.httpMethodArr.includes(jsonSchemaMethod as types.httpMethod)){
        return jsonSchemaMethod as types.httpMethod;
    }
    else{
        log.error(`httpMethod : invalid method "${jsonSchemaMethod}" in "${documentName}".`);
        process.exit(1);
    }
}

export function copyDir(source: string, destination: string, compilerOptions: types.compilerOptions, overwrite?:boolean, ): void {
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination);
    }

    const files: string[] = fs.readdirSync(source);

    for (let i = 0; i < files.length; i++) {
        const current: fs.Stats = fs.lstatSync(source + "/" + files[i]);

        if (current.isDirectory()) {
            copyDir(source + "/" + files[i], destination + "/" + files[i], compilerOptions, overwrite);
        }
        // avoid overwrite
        else if ( !overwrite && fs.existsSync(destination + "/" + files[i])) {
            log.info(`FILE : existed, skip file ${destination + "/" + files[i]} exist, skip`);
        }
        else {
            const outPath: string = destination + "/" + files[i];
            // read file, replace header, write file
            log.writing(`FILE : ${outPath}`);
            let content = fs.readFileSync(source + "/" + files[i], "utf8");
            content = content.replace(/{{headerComment}}/g, compilerOptions.headerComment);
            fs.writeFileSync(outPath, content);
        }
    }
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
    relativePath,
    cleanXcustomValue,
    httpMethod,
    loadJsonSchema,
    copyDir,
    isUseOAuth,
};