import fs from "fs";
import log from "../utils/logger";


export function compile(
    packageOutPath: string,
    schemaDir: string,
    outDir: string,
): void {
    // read package.json and add script section
    log.process(`Project : ${packageOutPath}`);
    let writePackage: boolean = false;
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
        packageJson.scripts.vexgen = vexgenScript;
        writePackage = true;
        log.process(`package.json : Update script : vexgen > ${packageJson.scripts.vexgen}`);
    }

    if (!packageJson.scripts.build) {
        packageJson.scripts.build = "tsc -p .";
        writePackage = true;
        log.process(`package.json : Update script : build > ${packageJson.scripts.build}`);
    }

    if (!packageJson.scripts.dev) {
        packageJson.scripts.dev = `nodemon --watch src --exec ts-node ${outDir}/server.ts`;
        writePackage = true;
        log.process(`package.json : Update script : dev > ${packageJson.scripts.dev}`);
    }

    if (!packageJson.scripts.start) {
        packageJson.scripts.start = "node ./dist/server.js";
        writePackage = true;
        log.process(`package.json : Update script : start > ${packageJson.scripts.start}`);
    }

    // write file 
    if (writePackage) {
        log.writing(`Project : ${packageOutPath}`);
        fs.writeFileSync(packageOutPath, JSON.stringify(packageJson, null, 4));
    }
    else{
        log.info("package.json : No changes");
    }

}

export default {
    compile
};