import fs from "fs";
import path from "path";

// import * as openapiGen from "./generators/app/openapi.generator";

import utils from "./utils";
import log from "./utils/logger";
import { applyFkMetadata } from "./preprocess/jsonSchemaForeignKeys";
import { formatJsonSchema, formatJsonSchemaRoleDefinition } from "./preprocess/jsonschemaFormat";

import * as types from "./types/types";
import * as userSchemaGen from "./generators/projectSettings/userSchema.generator";
import * as projectSettingsGen from "./generators/projectSettings";


import * as roleGen from "./generators/role/role.generator";
import * as controllerGen from "./generators/controller/controllers.generator";
import * as routeGen from "./generators/routes/routes.generator";
import * as serverGen from "./generators/app/server.generator";
import * as typeormEntityGen from "./generators/db/typeormEntity.generator";
import * as mongooseModelGen from "./generators/db/mongooseModel.generator";
import * as sqlMigrationGen from "./generators/db/sqlMigration.generator";
import * as interfaceGen from "./generators/interface/generator";
import * as joinWhitelistRegistryGen from "./generators/middlewares/joinWhitelistRegistry.generator";
import * as dataIsolationRegistryGen from "./generators/middlewares/dataIsolationRegistry.generator";

export async function generate(
    options: types.compilerOptions
): Promise<void> {
    utils.configChecker.checkConfigValid(options);
    // const openapiFile: string = "/openapi.gen.yaml";
    const documents: { path: string, config: types.documentConfig, schema: types.jsonSchema }[] = [];
    const documentPaths: { [key: string]: string } = {};

    // set system options
    options._ = {
        writtedDir: [],
    };

    // provide compilerOptions to utils.common for meta handling
    utils.common.setCompilerOptions(options);

    const dir = {
        roleSrcDir: path.posix.join(options.srcDir, "roles"),
        roleDir: path.posix.join(options.sysDir, "_roles"),
        routeDir: path.posix.join(options.sysDir, "_routes"),
        middlewareDir: path.posix.join(options.sysDir, "_middlewares"),
        controllerDir: path.posix.join(options.sysDir, "_controllers"),
        modelDir: path.posix.join(options.sysDir, "_models"),
        typeDir: path.posix.join(options.sysDir, "_types"),
        serviceDir: path.posix.join(options.sysDir, "_services"),
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
    // if (!fs.existsSync(options.openapiDir)) { fs.mkdirSync(options.openapiDir); }
    if (!fs.existsSync(dir.roleSrcDir)) { fs.mkdirSync(dir.roleSrcDir); }
    Object.values(dir).forEach((path: string) => {
        if (!fs.existsSync(path)) { fs.mkdirSync(path); }
    });

    // copy static files
    utils.common.copyDir(path.join(__dirname, "templates", "_controllers"), dir.controllerDir, options, true);
    utils.common.copyDir(path.join(__dirname, "templates", "_middlewares"), dir.middlewareDir, options, true);
    utils.common.copyDir(path.join(__dirname, "templates", "_roles"), dir.roleDir, options, true);
    utils.common.copyDir(path.join(__dirname, "templates", "_routes"), dir.routeDir, options, true);
    utils.common.copyDir(path.join(__dirname, "templates", "_services"), dir.serviceDir, options, true);
    utils.common.copyDir(path.join(__dirname, "templates", "_types"), dir.typeDir, options, true);
    utils.common.copyDir(path.join(__dirname, "templates", "_utils"), dir.utilsDir, options, true);
    utils.common.copyDir(path.join(__dirname, "templates", "root"), options.rootDir, options, false);
    utils.common.copyDir(path.join(__dirname, "templates", "jsonSchema"), options.jsonSchemaDir, options, true);
    if (options.useRBAC) utils.common.copyDir(path.join(__dirname, "templates", "jsonSchemaRBAC"), options.jsonSchemaDir, options, true);

    // update userSchema
    await userSchemaGen.compile({ compilerOptions: options || utils.generator.defaultCompilerOptions });
    
    // prepair schema files
    formatJsonSchemaRoleDefinition({ compilerOptions: options || utils.generator.defaultCompilerOptions });
    
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
                schema: jsonSchema,
            });
            documentPaths[jsonSchema["x-documentConfig"].documentName] = schemaPath;
        }
        catch (err: any) {
            log.error(`Processing File : ${schemaPath}\n`, err);
        }
    });
    applyFkMetadata(documents);

    // ===== Start Generations ===== //

    // generate role & permissions
    await roleGen.compile({
        schemas: documents.map((doc) => doc.schema),
        roleSourceDir: dir.roleSrcDir,
        roleOutDir: dir.roleDir, 
        middlewareDir: dir.middlewareDir,
        compilerOptions: options || utils.generator.defaultCompilerOptions
    });

    // generate models & types
    await Promise.all(documents.map( async (doc: { path: string, config: types.documentConfig, schema: types.jsonSchema }) => {
        await interfaceGen.compile(
            doc.schema as any,
            path.join(dir.typeDir, `${doc.config.documentName}.gen.ts`),
        );

        if (options.dbType === "mongo") {
            await mongooseModelGen.compile({
                jsonSchema: doc.schema,
                schemaPath: doc.path,
                outDir: dir.modelDir,
                typeDir: dir.typeDir,
                compilerOptions: options || utils.generator.defaultCompilerOptions,
            });
        } 
        else if (options.dbType === "sql") {
            await typeormEntityGen.compile({
                jsonSchema: doc.schema,
                outDir: dir.modelDir,
                compilerOptions: options || utils.generator.defaultCompilerOptions,
                allSchemas: documents.map(d => d.schema),
            });
        }

        // generate controller
        await controllerGen.compile({
            jsonSchema: doc.schema,
            controllerOutDir: dir.controllerDir,
            modelDir: dir.modelDir,
            compilerOptions: options || utils.generator.defaultCompilerOptions,
            allSchemas: documents.map(d => d.schema),
        });

        // prepare route data
        routeData.push({
            route: `/${doc.config.documentName}`,
            documentName: doc.config.documentName,
            controllerPath: path.posix.join(utils.common.relativePath(dir.routeDir, dir.controllerDir), doc.config.documentName + "Controller.gen"),
        });

        return;
    }));

    // generate join whitelist registry (centralized static map, used by JoinWhitelistMiddleware)
    await joinWhitelistRegistryGen.compile({
        allSchemas: documents.map(d => d.schema),
        middlewareDir: dir.middlewareDir,
    });

    // generate data isolation registry (entity → ownership field mapping, used by TypeOrmRepositoryAdapter)
    await dataIsolationRegistryGen.compile({
        allSchemas: documents.map(d => d.schema),
        middlewareDir: dir.middlewareDir,
    });

    // generate sql migrations
    if (options.dbType === "sql") {
        await sqlMigrationGen.compile({
            schemas: documents.map((d) => d.schema),
            outDir: dir.modelDir,
        });
    }

    // generate route from routeData
    await routeGen.compile({
        routesDir: dir.routeDir,
        compilerOptions: options || utils.generator.defaultCompilerOptions
    });

    // generate server/entrypoint
    await serverGen.compile(options);

    // generate project files
    await projectSettingsGen.compile(options);

    // record last generated version once after full generation
    utils.common.saveVexMeta();

    // await configGen.compile(options);

    utils.common.cleanupStaleFiles();

    return ;
}