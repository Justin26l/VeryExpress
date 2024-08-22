import fs from "fs";

import json2mongoose from "json2mongoose";
import * as openapiGen from "./generators/app/openapi.generator";

import utils from "./utils";
import log from "./utils/logger";
import { formatJsonSchema } from "./preprocess/jsonschemaFormat";
import { roleSchemaFormat } from "./preprocess/roleSetupFile";

import * as types from "./types/types";
import * as userSchemaGen from "./generators/project/userSchema.generator";
import * as roleGen from "./generators/role/role.generator";
import * as controllerGen from "./generators/controller/controllers.generator";
import * as routeGen from "./generators/routes/routes.generator";
import * as serverGen from "./generators/app/server.generator";

export async function generate(
    options: types.compilerOptions
): Promise<void> {
    utils.configChecker.checkConfigValid(options);
    const openapiFile: string = "/openapi.gen.yaml";
    const documents: { path: string, config: types.documentConfig }[] = [];
    const documentPaths: { [key: string]: string } = {};

    const dir = {
        roleSrcDir: `${options.srcDir}/roles`,
        roleDir: `${options.sysDir}/_roles`,
        routeDir: `${options.sysDir}/_routes`,
        middlewareDir: `${options.sysDir}/_middlewares`,
        controllerDir: `${options.sysDir}/_controllers`,
        modelDir: `${options.sysDir}/_models`,
        typeDir: `${options.sysDir}/_types`,
        serviceDir: `${options.sysDir}/_services`,
        pluginDir: `${options.sysDir}/_plugins`,
        utilsDir: `${options.sysDir}/_utils`,
    };

    const routeData: {
        route: string,
        documentName: string,
        controllerPath: string,
    }[] = [];

    // set default header comment
    options.headerComment = utils.generator.getGenaratorHeaderComment();

    // create all directories if not exist
    if (!fs.existsSync(options.rootDir)) { fs.mkdirSync(options.rootDir); }
    if (!fs.existsSync(options.srcDir)) { fs.mkdirSync(options.srcDir); }
    if (!fs.existsSync(options.sysDir)) { fs.mkdirSync(options.sysDir); }
    if (!fs.existsSync(options.openapiDir)) { fs.mkdirSync(options.openapiDir); }
    if (!fs.existsSync(dir.roleSrcDir)) { fs.mkdirSync(dir.roleSrcDir); }
    Object.values(dir).forEach((path: string) => {
        if (!fs.existsSync(path)) { fs.mkdirSync(path); }
    });

    // copy static files
    utils.common.copyDir(`${__dirname}/templates/_controllers`, dir.controllerDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_plugins`, dir.pluginDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_roles`, dir.roleDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_services`, dir.serviceDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_types`, dir.typeDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_utils`, dir.utilsDir, options, true);
    // utils.copyDir(`${__dirname}/templates/_middleware`, dir.middlewareDir, options, true);
    
    // update userSchema
    await userSchemaGen.compile({ compilerOptions: options || utils.generator.defaultCompilerOptions });

    // format role schema
    roleSchemaFormat({ compilerOptions: options || utils.generator.defaultCompilerOptions });
    
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
            documentPaths[jsonSchema["x-documentConfig"].documentName] = schemaPath;
        }
        catch (err: any) {
            log.error(`Processing File : ${schemaPath}\n`, err);
        }
    });

    // generate roles
    if ( options.useRBAC && options.useRBAC.roles.length > 0){
        await roleGen.compile({
            collectionList: documents.map((doc) => doc.config.documentName),
            roleSourceDir: dir.roleSrcDir,
            roleOutDir: dir.roleDir, 
            middlewareDir: dir.middlewareDir,
            compilerOptions: options || utils.generator.defaultCompilerOptions
        });
    }

    // genarate opanapi from jsonSchema
    await openapiGen.compile(
        openapiFile, 
        options || utils.generator.defaultCompilerOptions
    );
    utils.common.copyDir(`${options.openapiDir}`, options.srcDir + "/openapi", options, true);

    // generate dynamic files
    await Promise.all(documents.map( async (doc: { path: string, config: types.documentConfig }) => {
        
        // make model
        json2mongoose.modelsGen.compileFromFile(
            `${doc.path}`,
            `${utils.common.relativePath(dir.modelDir, dir.typeDir)}/${doc.config.documentName}.gen`,
            `${dir.modelDir}/${doc.config.documentName}Model.gen.ts`,
            options || utils.generator.defaultCompilerOptions
        );

        // make interface
        await json2mongoose.typesGen.compileFromFile(
            `${doc.path}`,
            `${dir.typeDir}/${doc.config.documentName}.gen.ts`,
            options || utils.generator.defaultCompilerOptions
        );

        // prepair route data
        routeData.push({
            route: `/${doc.config.documentName}`,
            documentName: doc.config.documentName,
            controllerPath: utils.common.relativePath(dir.routeDir, dir.controllerDir) + "/" + doc.config.documentName + "Controller.gen",
        });
        
        return;
    }));

    // genarate controller from open api
    await controllerGen.compile({
        documentPaths: documentPaths,
        openapiFile: openapiFile,
        controllerOutDir: dir.controllerDir,
        modelDir: dir.modelDir,
        compilerOptions: options || utils.generator.defaultCompilerOptions
    });

    // make route from routeData
    await routeGen.compile({
        routesArr: routeData,
        openapiFile: openapiFile,
        routesDir: dir.routeDir,
        compilerOptions: options || utils.generator.defaultCompilerOptions
    });

    // make server
    await serverGen.compile(options);

    return ;
}

