#!/usr/bin/env node
import fs from "fs";
import childProcess from "child_process";
import minimist from "minimist";

import { generate } from "./index";

import utils from "./utils";
import log from "./utils/logger";

import pkg from "../package.json";
import { compilerOptions } from "./types/types";

async function main() {
    console.log("\x1b[35m%s\x1b[0m", "\n========== veryExpress CLI (vex) Start ==========\n");

    /** configuration process */
    const args: minimist.ParsedArgs = minimist(process.argv.slice(2));
    let config: compilerOptions = utils.generator.defaultCompilerOptions;

    if (fs.existsSync("vex.config.json")) {
        try {
            config = JSON.parse(fs.readFileSync("vex.config.json", "utf8"));
        }
        catch (err) {
            log.error("failed to parse vex.config.json", err);
            process.exit(1);
        }
    }

    // directories
    config.jsonSchemaDir = args.j || args.jsonSchemaDir || config.jsonSchemaDir || "./jsonSchema";
    config.rootDir = args.o || args.rootDir || config.rootDir || ".";
    config.srcDir = config.srcDir || config.rootDir + "/src";
    config.sysDir = config.sysDir || config.srcDir + "/system";
    config.openapiDir = config.srcDir + "/openapi";
    
    // record last generation args or set default values
    config.generator = config.generator ?? {};
    config.generator.commitBeforeGenerate = config.generator.commitBeforeGenerate ?? false;

    // app
    config.app = config.app || {},
    config.app.enableSwagger = config.app.enableSwagger || true,
    config.app.useUserSchema = config.app.useUserSchema || true,
    config.app.useObjectID = config.app.useObjectID || true,
    config.app.allowApiCreateUpdate_id = config.app.allowApiCreateUpdate_id || false,
    // config.app.useStatefulRedisAuth = config.app.useStatefulRedisAuth || false;

    // RBAC
    config.useRBAC = config.useRBAC || { roles: [], default: "", schemaIncluded: [] };
    config.useRBAC.roles = config.useRBAC.roles || ["user"];
    config.useRBAC.default = config.useRBAC.default || "user";
    config.useRBAC.schemaIncluded = config.useRBAC.schemaIncluded || ["user"];

    // oauth
    config.auth = config.auth || {};
    config.auth.localAuth = config.auth.localAuth || false;
    config.auth.oauthProviders = config.auth.oauthProviders || {};
    config.auth.oauthProviders.google = config.auth.oauthProviders.google || false;
    config.auth.oauthProviders.github = config.auth.oauthProviders.github || false;
    // config.auth.oauthProviders.apple = config.auth.oauthProviders.apple || false;
    // config.auth.oauthProviders.microsoft = config.auth.oauthProviders.microsoft || false;
    // config.auth.oauthProviders.facebook = config.auth.oauthProviders.facebook || false;
    // config.auth.oauthProviders.azure = config.auth.oauthProviders.microsoft || false;


    // warnings
    if (config.app.useObjectID && config.app.allowApiCreateUpdate_id) {
        log.warn("Not recommended to use \"useObjectID\" with \"allowApiCreateUpdate_id\",\nthis may cause logic issues");
    }

    // errors
    if(config.auth.localAuth && !config.app.useUserSchema){
        log.error("localAuth requires useUserSchema to be true, please change vex.config.json \"app.useUserSchema\" to true or disable \"auth.localAuth\".");
        process.exit(1);
    }

    // set compiler options
    log.process("validate vex.config.json");
    utils.common.setCompilerOptions(config);
    utils.common.writeFile("vex.config", "vex.config.json", JSON.stringify(config, null, 4));

    /** 
     * ==================== 
     *     CLI Handler
     * ====================
     */

    /** Help */
    if (String(args._[0]).toLowerCase() === "h" || args["h"]) {
        log.info(`Very Express CLI Usage: 

    Information: 
    vex <args>
        -h : Help
        -v : Show version.

    Generate:
    vex <args>
        <empty> : Generate with param from vex.config.json.
        -i : Initialize, Create file vex.config.json. 
        -j : Set jsonSchemaDir (configured: ${config.jsonSchemaDir})
        -o : Set rootDir (configured: ${config.rootDir})

    note: no args
    `);
        process.exit(0);
    }

    /** Version */
    else if (String(args._[0]).toLowerCase() === "v" || args["v"]) {
        log.info(`Very Express Version : ${pkg.version}`);
        processEnd();
    }

    /** Initialization */
    else if (String(args._[0]).toLowerCase() === "i" || args["i"]) {

        if (!fs.existsSync(config.jsonSchemaDir)) {
            // check if nested directory then create
            const dir = config.jsonSchemaDir.split("/");
            let path = "";
            dir.forEach((d) => {
                path += d;
                if (!fs.existsSync(path)) {
                    fs.mkdirSync(path);
                }
                path += "/";
            });
        }

        processEnd("Very Express CLI : Initialization Complete.");
    }

    /** Generation */
    else {
        if (!fs.existsSync(config.jsonSchemaDir)) {
            log.error("Schema Dir Not Found:", config.jsonSchemaDir);
            process.exit(1);
        }

        // commit before generate
        if (config.generator.commitBeforeGenerate === true) {
            try {
                log.info("git commit \"before vex-gen\"");
                childProcess.execSync("git add . && git commit -m \"before vex-gen\"", { stdio: "inherit" });
            }
            catch (err) {
                log.error("git commit \"before vex-gen\" failed", err);
            }
        }

        // run main process
        log.process("generate with config", config);
        await generate(config);

        console.log(`next step:
            cd ${config.rootDir}
            npm install
            npm run dev
        `);
        processEnd();
    }
}

function processEnd(msg?: string) {
    if (msg) {
        console.log("\x1b[36m%s\x1b[0m", msg);
    }
    console.log("\x1b[35m%s\x1b[0m", "\n========== veryExpress CLI (vex) Complete ==========\n");
    process.exit();
}

main();