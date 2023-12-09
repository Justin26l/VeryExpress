import fs from 'fs';
import express from 'express';

import json2mongoose from 'json2mongoose';
import * as openapiGen from './openapi';
import utils from './utils';
import { compilerOptions } from './types/types';


export function genarate(
    schemaDir   : string,
    outDir      : string,
    directories ?: {
        routeDir        ?: string,
        middlewareDir   ?: string,
        controllerDir   ?: string,
        modelDir        ?: string,
        typeDir         ?: string,
        serviceDir      ?: string,
        utilsDir        ?: string,
    },
    options ?: compilerOptions
) {
    const dir = {
        routeDir        : directories?.routeDir         || `${outDir}/route`,
        middlewareDir   : directories?.middlewareDir    || `${outDir}/middleware`,
        controllerDir   : directories?.controllerDir    || `${outDir}/controller`,
        modelDir        : directories?.modelDir         || `${outDir}/model`,
        typeDir         : directories?.typeDir          || `${outDir}/type`,
        serviceDir      : directories?.serviceDir       || `${outDir}/service`,
        utilsDir        : directories?.utilsDir         || `${outDir}/utils`,
    };

    const genDir = {
        routeDir        : dir.routeDir+'/generate',
        middlewareDir   : dir.middlewareDir+'/generate',
        controllerDir   : dir.controllerDir+'/generate',
        modelDir        : dir.modelDir+'/generate',
        typeDir         : dir.typeDir+'/generate',
        serviceDir      : dir.serviceDir+'/generate',
        utilsDir        : dir.utilsDir+'/generate',
    }

    // create all directories if not exist
    Object.values(dir).forEach((path: string) => {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    });

    // create all generated directories if not exist
    Object.values(genDir).forEach((path: string) => {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    });

    // genarate opanapi
    openapiGen.compile(schemaDir, outDir);

    // run json2mongoose
    // json2mongoose.genarate(schemaDir, genDir.modelDir, genDir.typeDir, {
    //     headerComment: utils.getGenaratorHeaderComment(),
    // });
    
    fs.readdir(schemaDir, (err: any, files: string[]) => {
        if (err) {
            console.log(err);
            return;
        }

        // iterate over files
        files.forEach((schemaFileName: string) => {
            try {
                
                // ignore non json files
                if (!schemaFileName.endsWith('.json')) {
                    return;
                }

                const fileName = schemaFileName.replace('.json', '');
                const fileTs = fileName + '.ts';

                // make interface
                json2mongoose.typesGen.compileFromFile(
                    `${schemaDir}/${schemaFileName}`,
                    `${genDir.typeDir}/${fileTs}`,
                    options || utils.defaultCompilerOptions
                );

                // make model
                json2mongoose.modelsGen.compileFromFile(
                    `${schemaDir}/${schemaFileName}`,
                    `${utils.relativePath(genDir.modelDir, genDir.typeDir)}/${fileName}`,
                    `${genDir.modelDir}/${fileTs}`,
                    options || utils.defaultCompilerOptions
                );

                // make controller

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
    });
};
