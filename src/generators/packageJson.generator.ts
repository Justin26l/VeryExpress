import fs from "fs";
import log from "../utils/logger";
import { writeFile } from "../utils";

export function compile(
    packageOutPath: string,
    schemaDir: string,
    outDir: string,
): void {
    // read package.json and add script section
    log.process(`Project : ${packageOutPath}`);
    let packjson: string = "";

    if (!fs.existsSync(packageOutPath)) {
        packjson = fs.readFileSync(__dirname + "/../templates/root/package.json").toString();
    }
    else {
        packjson = fs.readFileSync(packageOutPath).toString();
    }

    const packageJson = JSON.parse(packjson);
    const vexgenScript = `vex -j ${schemaDir} -o ${outDir}`;

    if (packageJson.scripts.vexgen !== vexgenScript) {
        log.process(`package.json : Update script : vexgen > ${packageJson.scripts.vexgen}`);
        packageJson.scripts.vexgen = vexgenScript;
    }

    if (!packageJson.scripts.build) {
        log.process(`package.json : Update script : build > ${packageJson.scripts.build}`);
        packageJson.scripts.build = "tsc -p .";
    }

    if (!packageJson.scripts.dev) {
        log.process(`package.json : Update script : dev > ${packageJson.scripts.dev}`);
        packageJson.scripts.dev = `nodemon --watch src --exec ts-node ${outDir}/server.ts`;
    }

    if (!packageJson.scripts.start) {
        log.process(`package.json : Update script : start > ${packageJson.scripts.start}`);
        packageJson.scripts.start = "node ./dist/server.js";
    }

    writeFile(`Project : ${packageOutPath}`, packageOutPath, JSON.stringify(packageJson, null, 4));

}

export default {
    compile
};