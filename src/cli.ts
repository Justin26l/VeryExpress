#!/usr/bin/env node
import generate from "./index";
import fs from "fs";
import childProcess from "child_process";
import minimist from "minimist";

import log from "./utils/log";

/**
 * configuration process
 */
const args: minimist.ParsedArgs = minimist(process.argv.slice(2));
let config: {[key:string]:any} = {};

if (fs.existsSync("vex.config.json")) {
    try {
        config = JSON.parse(fs.readFileSync("vex.config.json", "utf8"));
    }
    catch (err) {
        log.error("failed to parse vex.config.json", err);
        process.exit(1);
    }
}

// record input args or use default
config.commitBeforeGenerate = config.commitBeforeGenerate ?? false;
config.jsonSchemaDir = args.j || args.jsonSchemaDir || config.jsonSchemaDir || "./jsonSchema";
config.rootDir = args.o || args.rootDir || config.rootDir || ".";
config.srcDir = config.srcDir || config.rootDir + "/src" ;
config.openapiDir = config.openapiDir || config.rootDir + "./openapi";

console.log("\x1b[35m%s\x1b[0m", "\n========== veryExpress CLI (vex) Start ==========\n");
log.writing("vex.config.json");
fs.writeFileSync("vex.config.json", JSON.stringify(config, null, 4));

/**
 * Cli handler
 */

// -h : Help
if ("h" in args) {
    console.log(`
Usage: vex [jsonSchemaDir] [openapiDir] [rootDir]
    -h : Help
    -j : jsonSchemaDir (config: ${config.jsonSchemaDir})
    -o : rootDir (config: ${config.rootDir})
`);
    process.exit(0);
}

// check dir exists
if (!fs.existsSync(config.jsonSchemaDir)) {
    log.error("Schema Dir Not Found:", config.jsonSchemaDir);
    process.exit(1);
}

if (!fs.existsSync(config.rootDir)) {
    fs.mkdirSync(config.rootDir);
}

if (!fs.existsSync(config.srcDir)) {
    fs.mkdirSync(config.srcDir);
}


// commit before generate
if (config.commitBeforeGenerate === true) {
    try {
        log.info("git commit \"before vex-gen\"");
        childProcess.execSync("git add . && git commit -m \"before vex-gen\"", { stdio: "inherit" });
    }
    catch (err) {
        log.error("git commit \"before vex-gen\" failed", err);
    }
}

// run main process
generate({
    jsonSchemaDir : config.jsonSchemaDir,
    rootDir : config.rootDir,
    srcDir : config.srcDir,
    openapiDir : config.openapiDir,
});

console.log("\x1b[35m%s\x1b[0m", "\n========== veryExpress CLI (vex) Complete ==========\n");
console.log("\x1b[36m%s\x1b[0m", "\nnext step:\n", `cd ${config.rootDir}\n`, "npm install\n", "npm run dev");
