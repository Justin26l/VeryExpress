#!/usr/bin/env node
import fs from "fs";
import childProcess from "child_process";
import minimist from "minimist";

import { generate } from "./index";
import log from "./utils/logger";

import { compilerOptions } from "./types/types";
import { defaultCompilerOptions } from "./utils/common";

console.log("\x1b[35m%s\x1b[0m", "\n========== veryExpress CLI (vex) Start ==========\n");

/** configuration process */
const args: minimist.ParsedArgs = minimist(process.argv.slice(2));
let config: compilerOptions = defaultCompilerOptions; 

if (fs.existsSync("vex.config.json")) {
    try {
        config = JSON.parse(fs.readFileSync("vex.config.json", "utf8"));
    }
    catch (err) {
        log.error("failed to parse vex.config.json", err);
        process.exit(1);
    }
}

// record last generation args or set default values
config.commitBeforeGenerate = config.commitBeforeGenerate ?? false;

config.jsonSchemaDir = args.j || args.jsonSchemaDir || config.jsonSchemaDir || "./jsonSchema";
config.rootDir = args.o || args.rootDir || config.rootDir || ".";
config.srcDir = config.srcDir || config.rootDir + "/src" ;
config.openapiDir = config.openapiDir || config.rootDir + "./openapi";

config.enableSwagger = config.enableSwagger || true,
config.useUserSchema = config.useUserSchema || true,
config.useObjectID = config.useObjectID || true,
config.allowApiCreateUpdate_id = config.allowApiCreateUpdate_id || false,
config.useOauth = config.useOauth || {
    google: false,
    microsoft: false,
    apple: false,
    github: false
};

if ( config.useObjectID && config.allowApiCreateUpdate_id ){
    log.warn(`Not recommended to use "useObjectID" with "allowApiCreateUpdate_id",\nthis may cause security issues`);
};

log.process("vex.config.json");
fs.writeFileSync("vex.config.json", JSON.stringify(config, null, 4));

/** 
 * ==================== 
 *     CLI Handler
 * ====================
 */

/** Help */
if ( String(args._[0]).toLowerCase() === "h" || args["h"] ) {
    console.log(`Very Express CLI Usage :
vex [flag]
    -h : Help
    -i : Create generator config etc. 
to generate app :
    vex [jsonSchemaDir] [rootDir]
    -j : jsonSchemaDir (configured: ${config.jsonSchemaDir})
    -o : rootDir (configured: ${config.rootDir})
`);
    process.exit(0);
}

/** Initialization */
else if ( String(args._[0]).toLowerCase() === "i" || args["i"] ) {
    console.log("Very Express CLI : Initialization ...");
    process.exit(0);
}

/** Generation */
else {
    if (!fs.existsSync(config.jsonSchemaDir)) {
        log.error("Schema Dir Not Found:", config.jsonSchemaDir);
        process.exit(1);
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
    console.log(config);
    generate(config);

    console.log("\x1b[36m%s\x1b[0m", "\nnext step:\n", `cd ${config.rootDir}\n`, "npm install\n", "npm run dev");
}

console.log("\x1b[35m%s\x1b[0m", "\n========== veryExpress CLI (vex) Complete ==========\n");
