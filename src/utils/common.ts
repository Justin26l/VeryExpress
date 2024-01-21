// read package.json and get version
import fs from "fs";
import path from "path";
import childProcess from "child_process";
import * as types from "../types/types";
import log from "./log";

function getPackageInfo(): {
    version: string,
    author: string,
    } {
    let globalPackages: {[key:string]:any} = {};
    // get local npm package dependencies with npm -g list
    try {
        globalPackages = JSON.parse(childProcess.execSync("npm -g list --json",).toString());
        // console.log(globalPackages)
    } catch (error) {
        log.error("Failed to execute command: npm -g list --json", error);
    }

    return {
        version: globalPackages.dependencies["very-express"].version || "[unknown version]",
        author: globalPackages.author || "justin26l",
    };
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
        return log.error("Error Load JsonSchema File :\n", e.message || e);
    }
}


export function getGenaratorHeaderComment(comment?: string): string {
    const packageInfo = getPackageInfo();
    return `/* eslint-disable */
/**
 * Generated by veryExpress@${packageInfo.version}
 * We recommend not to modified it manually because it will be overwrite.
 * we suggest to modified the jsonSchema then regenerate the project .
 * 
 * author: ${packageInfo.author}
 * version: ${packageInfo.version}${comment ? `\n * comment: ${comment}` : ""}
 */
`;
}

export function getSimpleHeaderComment(): string {
    const packageInfo = getPackageInfo();
    return `// Generated by veryExpress@${packageInfo.version}`;
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
export function httpMethod(jsonSchemaMethod: string) : types.httpMethod {
    if (jsonSchemaMethod == "getList"){ 
        return "get";
    }
    else if (types.httpMethodArr.includes(jsonSchemaMethod)){
        return jsonSchemaMethod as types.httpMethod;
    }
    else{
        log.error(`httpMethod : invalid method "${jsonSchemaMethod}" in jsonSchema`);
        process.exit();
    }
}

export function copyDir(source: string, destination: string): void {
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination);
    }

    const files: string[] = fs.readdirSync(source);

    for (let i = 0; i < files.length; i++) {
        const current: fs.Stats = fs.lstatSync(source + "/" + files[i]);

        if (current.isDirectory()) {
            copyDir(source + "/" + files[i], destination + "/" + files[i]);
        }
        else if (current.isSymbolicLink()) {
            const symlink = fs.readlinkSync(source + "/" + files[i]);
            fs.symlinkSync(symlink, destination + "/" + files[i]);
        }
        else {
            const outPath: string = destination + "/" + files[i];
            log.writing(`Utils : ${outPath}`);
            fs.copyFileSync(source + "/" + files[i], outPath);
        }
    }
}

export const defaultCompilerOptions: types.compilerOptions = {
    headerComment: getGenaratorHeaderComment(),
    rootDir: ".",
    srcDir: "./src",
    jsonSchemaDir: "./jsonSchema",
    openapiDir: "./openapi",
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
};