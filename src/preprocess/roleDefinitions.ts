import fs from "fs";
import path from "path";
import * as types from "../types/types";
import utils from "../utils";
import log from "../utils/logger";

export function generateRolesSettings(options: {
    schemas: types.jsonSchema[],
    rolesDir: string,
    compilerOptions: types.compilerOptions
}): void {
    if(!options.compilerOptions.useRBAC){ return; }

    const permissionArray = [ "create", "read", "update", "delete", "search"];

    options.compilerOptions.useRBAC?.roles.forEach((role) => {

        log.process(`Role Setting File : ${role}`);

        // 1. check role file exist, if not create it
        const roleFilePath = `${options.rolesDir}/${role}.json`;
        const content: types.roleJson = {};

        if (fs.existsSync(roleFilePath)) {
            Object.assign(content, utils.common.loadJson<types.roleJson>(roleFilePath));
        }

        // 2. check role object exist, if not add it in content
        options.schemas.forEach(schema => {
            if (!content[schema["x-documentConfig"].documentName]) {
                content[schema["x-documentConfig"].documentName] = permissionArray;
            }
        });

        utils.common.writeFile(`Role Setting File : ${roleFilePath}`, roleFilePath, JSON.stringify(content, null, 4));
    });
}