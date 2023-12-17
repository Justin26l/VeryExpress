import fs from 'fs';

import json2mongoose from 'json2mongoose';
import * as openapiGen from './generators/openapi.generator';

import utils from './utils';
import * as controllerGen from './generators/controllers.generator';
import * as routeGen from './generators/routes.generator';
import * as serverGen from './generators/server.generator';
import { compilerOptions } from './types/types';


export default function generate(
    schemaDir: string,
    openapiDir: string,
    outDir: string,
    options?: compilerOptions
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
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    };
    if (!fs.existsSync(openapiDir)) {
        fs.mkdirSync(openapiDir);
    }

    Object.values(dir).forEach((path: string) => {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path);
        }
    });

    // genarate opanapi
    openapiGen.compile(schemaDir, openapiDir + '/openapi.gen.yaml');

    // clone nessasary files
    utils.copyDir(`${openapiDir}`, outDir + '/openapi');
    utils.copyDir(`${__dirname}/templates/utils`, dir.utilsDir);

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

            const fileName = schemaFileName.replace('.json', '');

            // make interface
            json2mongoose.typesGen.compileFromFile(
                `${schemaDir}/${schemaFileName}`,
                `${dir.typeDir}/${fileName}.gen.ts`,
                options || utils.defaultCompilerOptions
            );

            // make model
            json2mongoose.modelsGen.compileFromFile(
                `${schemaDir}/${schemaFileName}`,
                `${utils.relativePath(dir.modelDir, dir.typeDir)}/${fileName}.gen`,
                `${dir.modelDir}/${fileName}Model.gen.ts`,
                options || utils.defaultCompilerOptions
            );

            // prepair route data
            const schema: any = JSON.parse(fs.readFileSync(`${schemaDir}/${schemaFileName}`, 'utf-8'));
            routeData.push({
                route: `/${schema['x-documentConfig'].documentName}`,
                controllerClassName: schema['x-documentConfig'].interfaceName,
                controllerPath: utils.relativePath(dir.routeDir, dir.controllerDir) + '/' + schema['x-documentConfig'].interfaceName + 'Controller.gen',
            });

        }
        catch (err: any) {
            console.error('\x1b[31m%s\x1b[0m', `Processing File : ${schemaDir}/${schemaFileName}\n`, err);
        };
    });

    // make controller from open api
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

