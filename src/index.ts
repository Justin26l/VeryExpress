import fs from "fs";
import path from "path";

import json2mongoose from "json2mongoose";
import * as openapiGen from "./generators/app/openapi.generator";

import utils from "./utils";
import log from "./utils/logger";
import { formatJsonSchema } from "./preprocess/jsonschemaFormat";
import { roleSchemaFormat } from "./preprocess/roleSetupFile";

import * as types from "./types/types";
import * as userSchemaGen from "./generators/projectSettings/userSchema.generator";
import * as projectSettingsGen from "./generators/projectSettings";


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

    // set system options
    options._ = {
        writtedDir: [],
    };

    const dir = {
        roleSrcDir: path.posix.join(options.srcDir, "roles"),
        roleDir: path.posix.join(options.sysDir, "_roles"),
        routeDir: path.posix.join(options.sysDir, "_routes"),
        middlewareDir: path.posix.join(options.sysDir, "_middlewares"),
        controllerDir: path.posix.join(options.sysDir, "_controllers"),
        modelDir: path.posix.join(options.sysDir, "_models"),
        typeDir: path.posix.join(options.sysDir, "_types"),
        serviceDir: path.posix.join(options.sysDir, "_services"),
        pluginDir: path.posix.join(options.sysDir, "_plugins"),
        utilsDir: path.posix.join(options.sysDir, "_utils"),
    };

    const routeData: {
        route: string,
        documentName: string,
        controllerPath: string,
    }[] = [];

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
    utils.common.copyDir(`${__dirname}/templates/_middlewares`, dir.middlewareDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_plugins`, dir.pluginDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_roles`, dir.roleDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_routes`, dir.routeDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_services`, dir.serviceDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_types`, dir.typeDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/_utils`, dir.utilsDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/root`, options.rootDir, options, true);
    utils.common.copyDir(`${__dirname}/templates/jsonSchema`, options.jsonSchemaDir, options, true);

    // format role schema
    roleSchemaFormat({ compilerOptions: options || utils.generator.defaultCompilerOptions });

    // update userSchema
    await userSchemaGen.compile({ compilerOptions: options || utils.generator.defaultCompilerOptions });
    
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
    if ( options.useRBAC && options.useRBAC.roles.length > 0 ){
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
        options
    );
    utils.common.copyDir(`${options.openapiDir}`, path.posix.join(options.srcDir, "openapi"), options, true);

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

        // replace interface <import xxx from "./xxx";> to <import xxx from "./xxx.gen";>
        const interfaceContent = fs.readFileSync(`${dir.typeDir}/${doc.config.documentName}.gen.ts`, "utf8");
        const remappedContent = interfaceContent.replace(/import (.*) from ".\/(.*)";/g, (match,a,b)=>{
            return `import ${a} from "./${b}.gen";`;
        });
        utils.common.writeFile("Type-Remap",`${dir.typeDir}/${doc.config.documentName}.gen.ts`, remappedContent);


        // prepair route data
        routeData.push({
            route: `/${doc.config.documentName}`,
            documentName: doc.config.documentName,
            controllerPath: path.posix.join(utils.common.relativePath(dir.routeDir, dir.controllerDir), doc.config.documentName + "Controller.gen"),
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

    // make project files
    await projectSettingsGen.compile(options);
    // await configGen.compile(options);

    return ;
}