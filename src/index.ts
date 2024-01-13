import fs from 'fs';

import json2mongoose from 'json2mongoose';
import * as openapiGen from './generators/openapi.generator';

import log from './utils/log';
import utils from './utils/common';
import * as controllerGen from './generators/controllers.generator';
import * as routeGen from './generators/routes.generator';
import * as serverGen from './generators/server.generator';

import * as types from './types/types';
import { formatJsonSchema } from './preprocess/jsonschemaFormat';


export default function generate(
    schemaDir: string,
    openapiDir: string,
    outDir: string,
    options?: types.compilerOptions
): void {

    const dir = {
        routeDir: `${outDir}/routes`,
        middlewareDir: `${outDir}/middlewares`,
        controllerDir: `${outDir}/controllers`,
        modelDir: `${outDir}/models`,
        typeDir: `${outDir}/types`,
        serviceDir: `${outDir}/services`,
        utilsDir: `${outDir}/utils`,
    };

    const openapipath = `${openapiDir}/openapi.gen.yaml`;

    // create all directories if not exist
    if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir); };
    if (!fs.existsSync(openapiDir)) { fs.mkdirSync(openapiDir); };
    Object.values(dir).forEach((path: string) => {
        if (!fs.existsSync(path)) { fs.mkdirSync(path); };
    });

    // prepair routerData
    log.process(`Router : ${openapipath}`);
    let routeData: {
        route: string,
        controllerClassName: string,
        controllerPath: string,
    }[] = [];

    const files: string[] = fs.readdirSync(schemaDir);
    files.forEach((schemaFileName: string) => {
        const schemaPath = `${schemaDir}/${schemaFileName}`;
        try {
            // ignore non json files
            if (!schemaFileName.endsWith('.json')) {
                log.warn(`Skipping Non Json File : ${schemaPath}`);
                return;
            }

            // read schema file config
            const jsonSchema: types.jsonSchema = formatJsonSchema(schemaPath);
            const documentConfig: types.documentConfig = jsonSchema["x-documentConfig"];

            if (!documentConfig) log.error(`x-documentConfig not found in ${schemaPath}`);
            if (!documentConfig.documentName) log.error(`x-documentConfig.documentName not found in ${schemaPath}`);
            if (!documentConfig.interfaceName) log.error(`x-documentConfig.interfaceName not found in ${schemaPath}`);
            if (!documentConfig.methods) log.error(`x-documentConfig.methods is not found in ${schemaPath}`);
            if (!Array.isArray(documentConfig.methods)) log.error(`x-documentConfig.methods is invalid in ${schemaPath}`);

            if (typeof jsonSchema.properties !== 'object') log.error(`properties is invalid in ${schemaPath}`);

            // check if 'fileName.nogen.ts' exist then skip generate of this file
            if (!fs.existsSync(`${schemaPath}.nogen.ts`)) {
                // make interface
                json2mongoose.typesGen.compileFromFile(
                    `${schemaPath}`,
                    `${dir.typeDir}/${documentConfig.interfaceName}.gen.ts`,
                    options || utils.defaultCompilerOptions
                );
            }

            // make model
            if (!fs.existsSync(`${schemaPath}Model.nogen.ts`)) {
                json2mongoose.modelsGen.compileFromFile(
                    `${schemaPath}`,
                    `${utils.relativePath(dir.modelDir, dir.typeDir)}/${documentConfig.interfaceName}.gen`,
                    `${dir.modelDir}/${documentConfig.interfaceName}Model.gen.ts`,
                    options || utils.defaultCompilerOptions
                );
            };

            // prepair route data
            routeData.push({
                route: `/${documentConfig.documentName}`,
                controllerClassName: documentConfig.interfaceName,
                controllerPath: utils.relativePath(dir.routeDir, dir.controllerDir) + '/' + documentConfig.interfaceName + 'Controller.gen',
            });

        }
        catch (err: any) {
            log.error(`Processing File : ${schemaPath}\n`, err);
        };
    });

    // genarate opanapi from json schema
    if (!fs.existsSync(openapiDir + '/openapi.nogen.yaml')) {
        openapiGen.compile(schemaDir, openapipath);
    };

    // clone nessasary files
    utils.copyDir(`${openapiDir}`, outDir + '/openapi');
    utils.copyDir(`${__dirname}/templates/utils`, dir.utilsDir);

    // genarate controller from open api
    controllerGen.compile(
        openapipath,
        `${utils.relativePath(dir.controllerDir, dir.modelDir)}`,
        dir.controllerDir,
        options || utils.defaultCompilerOptions
    );

    // make route from routeData
    routeGen.compile(
        routeData,
        openapipath,
        `${dir.routeDir}/routes.gen.ts`,
        options || utils.defaultCompilerOptions
    );

    // make middleware

    // make service

    // make server
    serverGen.compile(
        schemaDir,
        openapiDir,
        outDir,
        options || { headerComment: utils.getSimpleHeaderComment() }
    );

};

