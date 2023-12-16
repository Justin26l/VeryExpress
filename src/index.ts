import fs from 'fs';
import express from 'express';

import json2mongoose from 'json2mongoose';
import * as openapiGen from './openapi.generator';

import utils from './utils';
import * as controllerGen from './controllers.generator';

import { compilerOptions } from './types/types';


export function genarate(
    schemaDir: string,
    outDir: string,
    options?: compilerOptions
) {
    const dir = {
        routeDir: `${outDir}/routes`,
        middlewareDir: `${outDir}/middlewares`,
        controllerDir: `${outDir}/controllers`,
        modelDir: `${outDir}/models`,
        typeDir: `${outDir}/types`,
        serviceDir: `${outDir}/services`,
        utilsDir: `${outDir}/utils`,
    };

    const genDir = {
        routeDir: dir.routeDir + '/generate',
        middlewareDir: dir.middlewareDir + '/generate',
        controllerDir: dir.controllerDir + '/generate',
        modelDir: dir.modelDir + '/generate',
        typeDir: dir.typeDir + '/generate',
        serviceDir: dir.serviceDir + '/generate',
        utilsDir: dir.utilsDir + '/generate',
    }

    // create all directories if not exist
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }

    Object.values(dir).forEach((path: string) => {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    });

    // recreate all generated directories if not exist
    Object.values(genDir).forEach((path: string) => {
        if (fs.existsSync(path)) {
            fs.rmSync(path, { recursive: true });
        };
        fs.mkdirSync(path);
    });

    // genarate opanapi
    openapiGen.compile(schemaDir, schemaDir);

    // run json2mongoose
    // json2mongoose.genarate(schemaDir, genDir.modelDir, genDir.typeDir, { headerComment: utils.getGenaratorHeaderComment() });

    const files: string[] = fs.readdirSync(schemaDir);
    files.forEach((schemaFileName: string) => {
        try {
            // ignore non json files
            if (!schemaFileName.endsWith('.json')) return;
            console.log('\x1b[36m%s\x1b[0m', '[Processing]', ` : ${schemaDir + '/' + schemaFileName}`);

            const fileName = schemaFileName.replace('.json', '');

            // make interface
            json2mongoose.typesGen.compileFromFile(
                `${schemaDir}/${schemaFileName}`,
                `${genDir.typeDir}/${fileName}.ts`,
                options || utils.defaultCompilerOptions
            );

            console.log(`${utils.relativePath(genDir.modelDir, genDir.typeDir)}/${fileName}`)
            // make model
            json2mongoose.modelsGen.compileFromFile(
                `${schemaDir}/${schemaFileName}`,
                `${utils.relativePath(genDir.modelDir, genDir.typeDir)}/${fileName}`,
                `${genDir.modelDir}/${fileName}Model.ts`,
                options || utils.defaultCompilerOptions
            );

            // make controller
            controllerGen.compile(
                schemaDir+'/openapi.generated.yaml', 
                `${utils.relativePath(genDir.controllerDir, genDir.modelDir)}/${fileName}Model`,
                `${genDir.controllerDir}/${fileName}Controller.ts`,
                options || utils.defaultCompilerOptions
            );

            // make route

            // make middleware

            // make service

            // make utils

            // make test

        }
        catch (err: any) {
            console.error('\x1b[31m%s\x1b[0m', `Processing File : ${schemaDir}/${schemaFileName}\n`, err);
        }

    });
};

genarate(
    './jsonSchema',
    './output',
);
