import fs from "fs";

import json2mongoose from "json2mongoose";
import * as openapiGen from "./generators/openapi.generator";

import log from "./utils/logger";
import * as utils from "./utils";
import * as userSchemaGen from "./generators/userSchema.generator"
import * as roleGen from "./generators/role.generator";
import * as controllerGen from "./generators/controllers.generator";
import * as routeGen from "./generators/routes/routes.generator";
import * as serverGen from "./generators/server.generator";

import * as types from "./types/types";
import { formatJsonSchema } from "./preprocess/jsonschemaFormat";

export function generate(
    options: types.compilerOptions
): void {

    const openapiFile: string = "/openapi.gen.yaml";
    const roleSourceDir: string = `${options.rootDir}/roles`;
    const documents: { path: string, config: types.documentConfig }[] = [];

    const dir = {
        roleDir: `${options.srcDir}/roles`,
        routeDir: `${options.srcDir}/routes`,
        middlewareDir: `${options.srcDir}/middlewares`,
        controllerDir: `${options.srcDir}/controllers`,
        modelDir: `${options.srcDir}/models`,
        typeDir: `${options.srcDir}/types`,
        serviceDir: `${options.srcDir}/services`,
        pluginDir: `${options.srcDir}/plugins`,
        utilsDir: `${options.srcDir}/utils`,
    };

    const routeData: {
        route: string,
        interfaceName: string,
        controllerPath: string,
    }[] = [];

    // set default header comment
    if ( !options.headerComment ) {
        options.headerComment = utils.getGenaratorHeaderComment();
    }

    // create all directories if not exist
    if (!fs.existsSync(options.rootDir)) { fs.mkdirSync(options.rootDir); }
    if (!fs.existsSync(options.srcDir)) { fs.mkdirSync(options.srcDir); }
    if (!fs.existsSync(options.openapiDir)) { fs.mkdirSync(options.openapiDir); }
    Object.values(dir).forEach((path: string) => {
        if (!fs.existsSync(path)) { fs.mkdirSync(path); }
    });

    // copy static files
    utils.copyDir(`${__dirname}/templates/utils`, dir.utilsDir, options, true);
    utils.copyDir(`${__dirname}/templates/services`, dir.serviceDir, options, true);
    utils.copyDir(`${__dirname}/templates/plugins`, dir.pluginDir, options, true);
    utils.copyDir(`${__dirname}/templates/roles`, dir.roleDir, options, true);
    utils.copyDir(`${__dirname}/templates/middleware`, dir.middlewareDir, options, true);
    

    // update userSchema
    if ( options.app.useUserSchema ){
        userSchemaGen.compile({
            compilerOptions: options || utils.defaultCompilerOptions,
        });
    }

    // prepair schema files
    const files: string[] = fs.readdirSync(options.jsonSchemaDir);
    files.forEach((schemaFileName: string) => {
        const schemaPath = `${options.jsonSchemaDir}/${schemaFileName}`;
        try {
            // ignore non json files
            if (!schemaFileName.endsWith(".json")) {
                log.warn(`Skipping Non Json File : ${schemaPath}`);
                return;
            }

            // read schema file config
            const jsonSchema: types.jsonSchema = formatJsonSchema(schemaPath, options);
            documents.push({
                path: schemaPath,
                config: jsonSchema["x-documentConfig"],
            });
        }
        catch (err: any) {
            log.error(`Processing File : ${schemaPath}\n`, err);
        }
    });

    // generate roles
    if ( options.useRBAC && options.useRBAC.roles.length > 0){
        roleGen.compile({
            collectionList: documents.map((doc) => doc.config.documentName),
            roleSourceDir: roleSourceDir,
            roleOutDir: dir.roleDir, 
            compilerOptions: options || utils.defaultCompilerOptions
        });
    }

    // genarate opanapi from jsonSchema
    openapiGen.compile(
        openapiFile, 
        options || utils.defaultCompilerOptions
    );
    utils.copyDir(`${options.openapiDir}`, options.rootDir + "/openapi", options, true);

    // generate dynamic files
    documents.forEach((doc: { path: string, config: types.documentConfig }) => {
        // make interface
        json2mongoose.typesGen.compileFromFile(
            `${doc.path}`,
            `${dir.typeDir}/${doc.config.interfaceName}.gen.ts`,
            options || utils.defaultCompilerOptions
        );
        
        // make model
        json2mongoose.modelsGen.compileFromFile(
            `${doc.path}`,
            `${utils.relativePath(dir.modelDir, dir.typeDir)}/${doc.config.interfaceName}.gen`,
            `${dir.modelDir}/${doc.config.interfaceName}Model.gen.ts`,
            options || utils.defaultCompilerOptions
        );

        // prepair route data
        routeData.push({
            route: `/${doc.config.documentName}`,
            interfaceName: doc.config.interfaceName,
            controllerPath: utils.relativePath(dir.routeDir, dir.controllerDir) + "/" + doc.config.interfaceName + "Controller.gen",
        });
    });

    // genarate controller from open api
    controllerGen.compile({
        openapiFile: openapiFile,
        controllerOutDir: dir.controllerDir,
        modelDir: dir.modelDir,
        compilerOptions: options || utils.defaultCompilerOptions
    });

    // make route from routeData
    routeGen.compile({
        routesArr: routeData,
        openapiFile: openapiFile,
        routesDir: dir.routeDir,
        compilerOptions: options || utils.defaultCompilerOptions
    });

    // make server
    serverGen.compile(options);

}

