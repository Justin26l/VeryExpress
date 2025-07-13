// read package.json and get version
import fs from "fs";
import path from "path";
import * as types from "../types/types";
import log from "./logger";

export const writtedFiles: string[] = [];

export const relativePath = (fromPath: string, toPath: string): string => {
    return path.relative(fromPath, toPath).replace(/\\/g, "/");
};

export function loadJson<T = any>(filePath: string, fileNotExistHandler?: () => T): T {
    // handle file not found
    const fileExist = fs.existsSync(filePath);
    if ( !fileExist && fileNotExistHandler ){
        return fileNotExistHandler();
    }
    else if ( !fileExist ){
        return log.error(`FILE : ${filePath} not found`);
    }
    else{
        try {
            const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
            return content ? content : log.error(`FILE JSON : Read Error ${filePath}`);
        }
        catch (err: any) {
            return log.error(`FILE : ${filePath}\n`, err.message);
        }
    }
}

export function writeFile(title: string, destination: string, newContent: string): boolean {
    // read file, check difference, if yes write file
    const oldContent = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : "";
    if (oldContent === newContent) {
        // log.info(`${title} : "${destination}" No changes`);
        return false;
    }
    else {
        log.writing(`${title} : "${destination}"`);
        fs.writeFileSync(destination, newContent);
        return true;
    }
}

export function copyDir(source: string, destination: string, compilerOptions: types.compilerOptions, overwrite?: boolean): void {
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination);
    }

    const files: string[] = fs.readdirSync(source);

    for (let i = 0; i < files.length; i++) {
        const sourcePath = path.posix.join(source,files[i]);
        const destinationPath = path.posix.join(destination, files[i].replace(".ts", ".gen.ts"));            

        // recursive copy dir
        if ( fs.lstatSync(sourcePath).isDirectory() ) {
            copyDir(sourcePath, destinationPath, compilerOptions, overwrite);
        }
        // avoid overwrite
        else if (!overwrite && fs.existsSync(destinationPath)) {
            log.info(`FILE : AVOID OVERWRITE, skip "${destinationPath}"`);
        }
        // check file exist, read it check is same content, if is then skip
        else {
            let newContent = fs.readFileSync(sourcePath, "utf8");
            newContent = newContent.replace(/\/\/ {{headerComment}}/g, compilerOptions._.headerComment);
            writeFile(`FILE : ${destinationPath}`, destinationPath, newContent);

        }
    }
}

export default {
    relativePath,
    copyDir,
    loadJson,
    writeFile,
};