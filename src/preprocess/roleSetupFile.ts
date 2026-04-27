import fs from "fs";
import path from "path";
import * as types from "./../types/types";
import utils from "./../utils";
import log from "./../utils/logger";

export function roleSetupFile(options: {
    schemas: string[],
    roleSetupDir: string,
    compilerOptions: types.compilerOptions
}): void {
    if(!options.compilerOptions.useRBAC){ return; }

    const actionArray = [ "create", "read", "update", "delete", "search"];

    options.compilerOptions.useRBAC?.roles.forEach((role) => {

        log.process(`Role Setting File : ${role}`);

        // 1. check role file exist, if not create it
        const roleFilePath = `${options.roleSetupDir}/${role}.json`;
        const content: types.roleJson = {};

        if (fs.existsSync(roleFilePath)) {
            Object.assign(content, utils.common.loadJson<types.roleJson>(roleFilePath));
        }


        // 2. check role obejct exist, if not add it in content
        options.schemas.forEach(collectionName => {
            if (!content[collectionName]) {
                content[collectionName] = actionArray;
            }
        });

        utils.common.writeFile(`Role Setting File : ${roleFilePath}`, roleFilePath, JSON.stringify(content, null, 4));

    });

}

/**
 * SQL (PostgreSQL) target only.
 * Syncs role enum values from compilerOptions into UserRole.json's role field (x-vexData:"role").
 * Sets x-format:"PgEnum" so the TypeORM generator emits a native Postgres ENUM column.
 *
 * TODO (mongo): find schema with x-vexData:"role" prop across all schemas,
 *   set items.enum to compilerOptions.useRBAC.roles for Mongoose string enum validation.
 */
export function roleSchemaFormat(options: {
    compilerOptions: types.compilerOptions
}): void {
    if (!options.compilerOptions.useRBAC) return;
    // TODO: mongodb support, check userschema with x-vexData:"role", set enum to compilerOptions.useRBAC.roles for mongoose schema validation. --- IGNORE ---
    if (options.compilerOptions.dbType !== "sql") return;

    const roles = options.compilerOptions.useRBAC.roles;
    const userRolePath = path.posix.join(options.compilerOptions.jsonSchemaDir, "UserRole.json");

    if (!fs.existsSync(userRolePath)) {
        log.warn(`roleSchemaFormat: UserRole.json not found at ${userRolePath}, skipping role enum sync.`);
        return;
    }

    const schema = utils.common.loadJson<types.jsonSchema>(userRolePath);

    for (const key in schema.properties) {
        const prop = schema.properties[key];
        if (prop["x-vexData"] === "role") {
            prop.type = "string";
            prop.enum = roles;
            prop["x-format"] = "enum";
            log.process(`roleSchemaFormat: ${key} enum -> [${roles.join(", ")}] in UserRole.json`);
            break;
        }
    }

    utils.common.writeFile("Schema Role Formatting", userRolePath, JSON.stringify(schema, null, 4));
}
