import fs from "fs";
import * as types from "../types/types";
import { loadJson, writeFile } from "../utils";
import log from "../utils/logger";

export function roleSetupFile(options: {
    collectionList: string[],
    roleSetupDir: string,
    compilerOptions: types.compilerOptions
}): void {

    const actionArray = [ "create", "search", "read", "update", "delete"];

    options.compilerOptions.useRBAC?.roles.forEach((role) => {

        log.process(`RBAC Setting : ${role}`);

        // 1. check role file exist, if not create it
        const roleFilePath = `${options.roleSetupDir}/${role}.json`;
        if (!fs.existsSync(roleFilePath)) {
            writeFile(`Role Setup : ${role}`, roleFilePath, JSON.stringify({}, null, 4));
        }

        // 2. check role obejct exist, if not add it in content
        const content = loadJson<types.roleJson>(roleFilePath);
        options.collectionList.forEach(collectionName => {
            if (!content[collectionName]) {
                content[collectionName] = actionArray;
            }
        });

        writeFile(`RBAC Setting : ${roleFilePath}`, roleFilePath, JSON.stringify(content, null, 4));

    });

}
