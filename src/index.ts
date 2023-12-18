import fs from 'fs';

import json2mongoose from 'json2mongoose';
import * as openapiGen from './generators/openapi.generator';

import log from './utils/log';
import utils from './utils/common';
import * as controllerGen from './generators/controllers.generator';
import * as routeGen from './generators/routes.generator';
import * as serverGen from './generators/server.generator';

import * as types from './types/types';
import { isKeyObject } from 'util/types';


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

    // create all directories if not exist
    if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir); };
    if (!fs.existsSync(openapiDir)) { fs.mkdirSync(openapiDir); };
    Object.values(dir).forEach((path: string) => {
        if (!fs.existsSync(path)) { fs.mkdirSync(path); };
    });

    // data 
    let routeData: {
        route: string,
        controllerClassName: string,
        controllerPath: string,
    }[] = [];

    const files: string[] = fs.readdirSync(schemaDir);
    files.forEach((schemaFileName: string) => {
        try {
            // ignore non json files
            if (!schemaFileName.endsWith('.json')) return;

            // read schema file config
            const file = fs.readFileSync(`${schemaDir}/${schemaFileName}`);
            const jsonSchema: any = JSON.parse(file.toString());
            const documentConfig: types.documentConfig = jsonSchema["x-documentConfig"];

            if(!documentConfig) log.error(`x-documentConfig not found in ${schemaDir}/${schemaFileName}`);
            if(!documentConfig.documentName) log.error(`x-documentConfig.documentName not found in ${schemaDir}/${schemaFileName}`);
            if(!documentConfig.interfaceName) log.error(`x-documentConfig.interfaceName not found in ${schemaDir}/${schemaFileName}`);
            if(!documentConfig.methods) log.error(`x-documentConfig.methods is not found in ${schemaDir}/${schemaFileName}`);
            if(!Array.isArray(documentConfig.methods)) log.error(`x-documentConfig.methods is invalid in ${schemaDir}/${schemaFileName}`);

            if(typeof jsonSchema.properties !== 'object') log.error(`properties is invalid in ${schemaDir}/${schemaFileName}`);

            // make interface
            json2mongoose.typesGen.compileFromFile(
                `${schemaDir}/${schemaFileName}`,
                `${dir.typeDir}/${documentConfig.interfaceName}.gen.ts`,
                options || utils.defaultCompilerOptions
            );

            // make model
            json2mongoose.modelsGen.compileFromFile(
                `${schemaDir}/${schemaFileName}`,
                `${utils.relativePath(dir.modelDir, dir.typeDir)}/${documentConfig.interfaceName}.gen`,
                `${dir.modelDir}/${documentConfig.interfaceName}Model.gen.ts`,
                options || utils.defaultCompilerOptions
            );

            // prepair route data
            routeData.push({
                route: `/${documentConfig.documentName}`,
                controllerClassName: documentConfig.interfaceName,
                controllerPath: utils.relativePath(dir.routeDir, dir.controllerDir) + '/' + documentConfig.interfaceName + 'Controller.gen',
            });

        }
        catch (err: any) {
            log.error(`Processing File : ${schemaDir}/${schemaFileName}\n`, err);
        };
    });

    // genarate opanapi from json schema
    openapiGen.compile(schemaDir, openapiDir + '/openapi.gen.yaml');

    // clone nessasary files
    utils.copyDir(`${openapiDir}`, outDir + '/openapi');
    utils.copyDir(`${__dirname}/templates/utils`, dir.utilsDir);

    // genarate controller from open api
    controllerGen.compile(
        openapiDir + '/openapi.gen.yaml',
        `${utils.relativePath(dir.controllerDir, dir.modelDir)}`,
        dir.controllerDir,
        options || utils.defaultCompilerOptions
    );

    // make route from routeData
    routeGen.compile(
        routeData,
        openapiDir + '/openapi.gen.yaml',
        `${dir.routeDir}/routes.gen.ts`,
        options || utils.defaultCompilerOptions
    );

    // make middleware

    // make service

    // make server
    serverGen.compile(
        outDir,
        options || { headerComment: utils.getSimpleHeaderComment() }
    );

};

