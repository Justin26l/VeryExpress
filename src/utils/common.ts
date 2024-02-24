// read package.json and get version
import fs from "fs";
import path from "path";
import childProcess from "child_process";
import * as types from "../types/types";
import log from "./logger";

export const relativePath = (fromPath: string, toPath: string): string => {
    return path.relative(fromPath, toPath).replace(/\\/g, "/");
};

export function copyDir(source: string, destination: string, compilerOptions: types.compilerOptions, overwrite?:boolean ): void {
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
            const fileNameGen = files[i].replace('.ts', '.gen.ts');
            const outPath: string = destination + "/" + fileNameGen;
            // read file, replace header, write file
            log.writing(`FILE : ${outPath}`);
            let content = fs.readFileSync(source + "/" + files[i], "utf8");
            content = content.replace(/\/\/ {{headerComment}}/g, compilerOptions.headerComment);
            fs.writeFileSync(outPath, content);
        }
    }
}

export default {
    relativePath,
    copyDir,
};