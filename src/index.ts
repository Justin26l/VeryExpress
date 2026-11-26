import fs from "fs";
import path from "path";

import utils from "./utils";
import log from "./utils/logger";
import { applyFkMetadata } from "./preprocess/jsonSchemaForeignKeys";
import { formatJsonSchema, formatJsonSchemaRoleDefinition } from "./preprocess/jsonschemaFormat";
import { validateAuditFields } from "./preprocess/auditFields";
import { validateSoftDeleteFields } from "./preprocess/softDelete";
import { validateIsolationFields } from "./preprocess/isolation";
import { validateDeleteAccountConfig } from "./preprocess/deleteAccount";
import { validateAuthDocuments } from "./preprocess/authDocuments";

import * as types from "./types/types";
import * as userSchemaGen from "./generators/projectSettings/userSchema.generator";
import * as projectSettingsGen from "./generators/projectSettings";


import * as roleGen from "./generators/role/role.generator";
import * as controllerGen from "./generators/controller/controllers.generator";
import * as routeGen from "./generators/routes/routes.generator";
import * as serverGen from "./generators/app/server.generator";
import * as typeormEntityGen from "./generators/db/typeormEntity.generator";
import * as mongooseModelGen from "./generators/db/mongooseModel.generator";
import * as interfaceGen from "./generators/interface/generator";
import * as joinWhitelistRegistryGen from "./generators/middlewares/joinWhitelistRegistry.generator";
import * as dataIsolationRegistryGen from "./generators/middlewares/dataIsolationRegistry.generator";
import * as vexFieldRegistryGen from "./generators/middlewares/vexFieldRegistry.generator";
import * as tenantScopeGen from "./generators/middlewares/tenantScope.generator";
import * as tenantScopeContextGen from "./generators/middlewares/tenantScopeContext.generator";
import * as accountStateGuardGen from "./generators/services/accountStateGuard.generator";
import * as accountDeletionGen from "./generators/services/accountDeletion.generator";
import * as firebaseAuthGen from "./generators/services/firebaseAuth.generator";
import * as tenantServiceGen from "./generators/services/tenantService.generator";
import * as tenantControllerGen from "./generators/controller/tenantController.generator";
import * as authenticationGen from "./generators/middlewares/authentication.generator";
import * as jwtServiceGen from "./generators/services/jwtService.generator";

/**
 * Templates that exist only when the app has an auth method.
 *
 * They import the identity / session models directly, so they cannot be emitted unless the schemas
 * behind those models are. Turning auth off leaves no file in the generated app that names
 * `UserEntity`, `UserWithRelations` or `SessionEntity`.
 */
const AUTH_ONLY_TEMPLATES: Record<string, string[]> = {
    _middlewares: ["Authentication.ts"],
    _routes: ["FirebaseAuthUI.gen.ts", "LoginUI.ts", "oauth/OAuthRouteFactory.ts"],
    _services: [
        "auth/JWTKeyStore.ts",
        "auth/JWTService.ts",
        "oauth/OAuthProfileMap.ts",
        "oauth/OAuthStrategyService.ts",
    ],
    _types: ["auth.ts"],
    jsonSchema: ["Session.json", "UserAuthProfiles.json"],
};

export async function generate(
    options: types.compilerOptions
): Promise<void> {
    utils.configChecker.checkConfigValid(options);
    const documents: { path: string, config: types.documentConfig, schema: types.jsonSchema }[] = [];
    const documentPaths: { [key: string]: string } = {};

    options._ = {
        writtedDir: [],
    };

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
    if (!fs.existsSync(dir.roleSrcDir)) { fs.mkdirSync(dir.roleSrcDir); }
    Object.values(dir).forEach((path: string) => {
        if (!fs.existsSync(path)) { fs.mkdirSync(path); }
    });

    // No auth method means no identity and no session, so the templates that name them are not
    // copied at all; `cleanupStaleFiles` removes the ones an earlier run emitted.
    const authEnabled = utils.generator.isAuthEnabled(options);
    const authenticationEnabled = utils.generator.isAuthenticationEnabled(options);
    const useUserSchema = options.app?.useUserSchema === true;
    const authGate = (templateDir: string) => (entryPath: string): boolean => {
        // `app.useUserSchema` owns this file. A schema already in jsonSchemaDir is never touched:
        // it belongs to the app, and generation treats it as one of its documents.
        if (templateDir === "jsonSchema" && entryPath === "User.json") return useUserSchema;

        // The key store is shared by sign-in and verify-only: both check a signature against it.
        if (templateDir === "_services" && entryPath === "auth/JWTKeyStore.ts") return authenticationEnabled;

        return authEnabled || !AUTH_ONLY_TEMPLATES[templateDir].includes(entryPath);
    };

    utils.common.copyDir(path.join(__dirname, "templates", "_controllers"), dir.controllerDir, options, true);
    utils.common.copyDir(path.join(__dirname, "templates", "_middlewares"), dir.middlewareDir, options, true, authGate("_middlewares"));
    utils.common.copyDir(path.join(__dirname, "templates", "_routes"), dir.routeDir, options, true, authGate("_routes"));
    utils.common.copyDir(path.join(__dirname, "templates", "_services"), dir.serviceDir, options, true, authGate("_services"));
    utils.common.copyDir(path.join(__dirname, "templates", "_types"), dir.typeDir, options, true, authGate("_types"));
    utils.common.copyDir(path.join(__dirname, "templates", "_utils"), dir.utilsDir, options, true);
    utils.common.copyDir(path.join(__dirname, "templates", "root"), options.rootDir, options, false);
    utils.common.copyDir(path.join(__dirname, "templates", "jsonSchema"), options.jsonSchemaDir, options, true, authGate("jsonSchema"));
    if (utils.generator.isRbacEnabled(options)) {
        utils.common.copyDir(path.join(__dirname, "templates", "_roles"), dir.roleDir, options, true);
        utils.common.copyDir(path.join(__dirname, "templates", "jsonSchemaRBAC"), options.jsonSchemaDir, options, true);
    }

    // the tenant module's mapping table belongs to the membership layer, which resolves the caller
    // from a token; a header-only deployment owns no mapping table. An existing schema is left
    // alone so the app can extend it.
    if (utils.generator.isTenantMembershipEnabled(options)) {
        utils.common.copyDir(path.join(__dirname, "templates", "tenantJsonSchema"), options.jsonSchemaDir, options, false);
    }
    
    await userSchemaGen.compile({ compilerOptions: options || utils.generator.defaultCompilerOptions });
    
    formatJsonSchemaRoleDefinition({ compilerOptions: options || utils.generator.defaultCompilerOptions });
    
    // sort so document order — and therefore generated registry/route output — is
    // reproducible across filesystems (readdir order is not guaranteed)
    const files: string[] = fs.readdirSync(options.jsonSchemaDir).sort();
    files.forEach((schemaFileName: string) => {
        const schemaPath = `${options.jsonSchemaDir}/${schemaFileName}`;
        try {
            if (!schemaFileName.endsWith(".json")) {
                log.warn(`Skipping Non Json File : ${schemaPath}`);
                return;
            }

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
    // must run before foreign keys resolve: a UserRole key that points at a missing User document
    // would otherwise fail deep inside the relation builder
    validateAuthDocuments(documents, options);

    applyFkMetadata(documents);

    // audit / ownership declarations are cross-document (one identity source) — validate once
    validateAuditFields(documents, options);

    // soft-delete markers are per-document, but validated in the same pass so every schema
    // contradiction is reported together, before anything is generated
    validateSoftDeleteFields(documents);

    // isolation rules are cross-document too: the tenant membership document must not be
    // scoped, and the identity document cannot depend on a tenant. Normalizes legacy
    // `dataIsolation` into the current rule list.
    validateIsolationFields(documents, options);

    // auth.deleteAccount.deleteTables: every declared table must exist and be linkable to the
    // identity row at generation time
    validateDeleteAccountConfig(documents, options);

    await roleGen.compile({
        schemas: documents.map((doc) => doc.schema),
        roleSourceDir: dir.roleSrcDir,
        roleOutDir: dir.roleDir, 
        middlewareDir: dir.middlewareDir,
        compilerOptions: options || utils.generator.defaultCompilerOptions
    });

    await Promise.all(documents.map( async (doc: { path: string, config: types.documentConfig, schema: types.jsonSchema }) => {
        await interfaceGen.compile(
            doc.schema as any,
            path.join(dir.typeDir, `${doc.config.documentName}.gen.ts`),
            options || utils.generator.defaultCompilerOptions,
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

        await controllerGen.compile({
            jsonSchema: doc.schema,
            controllerOutDir: dir.controllerDir,
            modelDir: dir.modelDir,
            compilerOptions: options || utils.generator.defaultCompilerOptions,
            allSchemas: documents.map(d => d.schema),
        });

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

    // generate vex field registry (entity → auto-written audit fields + identity field, used by both adapters)
    await vexFieldRegistryGen.compile({
        allSchemas: documents.map(d => d.schema),
        documents: documents.map(d => ({ path: d.path, schema: d.schema })),
        middlewareDir: dir.middlewareDir,
        compilerOptions: options,
    });

    // tenant module — every file is emitted only when `vex.config.tenant.enable` is true;
    // cleanupStaleFiles removes them when the feature is turned off
    await tenantScopeContextGen.compile({
        compilerOptions: options,
        middlewareDir: dir.middlewareDir,
    });

    await tenantScopeGen.compile({
        compilerOptions: options,
        middlewareDir: dir.middlewareDir,
    });

    await tenantServiceGen.compile({
        compilerOptions: options,
        serviceDir: dir.serviceDir,
    });

    await tenantControllerGen.compile({
        compilerOptions: options,
        controllerDir: dir.controllerDir,
        typeDir: dir.typeDir,
    });

    // generate sql migrations
    // if (options.dbType === "sql") {
    //     await sqlMigrationGen.compile({
    //         schemas: documents.map((d) => d.schema),
    //         outDir: dir.modelDir,
    //     });
    // }

    // verify-only: Authentication and JWTService are re-emitted without the account side
    await authenticationGen.compile({
        compilerOptions: options,
        middlewareDir: dir.middlewareDir,
    });

    await jwtServiceGen.compile({
        compilerOptions: options,
        serviceDir: dir.serviceDir,
    });

    // generate account-state guard — Authentication.middleware imports it unconditionally,
    // so it is emitted for every project (no-op when the identity document is not soft-deletable)
    await accountStateGuardGen.compile({
        documents: documents.map(d => ({ path: d.path, schema: d.schema })),
        serviceDir: dir.serviceDir,
        compilerOptions: options,
    });

    // generate account-deletion service (identity domain; only when the feature is enabled)
    await accountDeletionGen.compile({
        documents: documents.map(d => ({ path: d.path, schema: d.schema })),
        serviceDir: dir.serviceDir,
        compilerOptions: options,
    });

    // generate the Firebase sign-in runtime (service account loader + verifier/provisioner service).
    // The login-page wiring module is written for every project, as a no-op when the switch is off.
    await firebaseAuthGen.compile({
        serviceDir: dir.serviceDir,
        routeDir: dir.routeDir,
        compilerOptions: options,
    });

    await routeGen.compile({
        routesDir: dir.routeDir,
        compilerOptions: options || utils.generator.defaultCompilerOptions
    });

    await serverGen.compile(options);

    await projectSettingsGen.compile(options);

    // record last generated version once after full generation
    utils.common.saveVexMeta();

    utils.common.cleanupStaleFiles();

    return ;
}