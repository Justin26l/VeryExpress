import fs from "fs";
import * as types from "./../types/types";
import utils from "./../utils";
import log from "./../utils/logger";

export function roleSetupFile(options: {
    collectionList: string[],
    roleSetupDir: string,
    compilerOptions: types.compilerOptions
}): void {
    if(!options.compilerOptions.useRBAC){ return; }

    const actionArray = [ "create", "read", "update", "delete"];

    options.compilerOptions.useRBAC?.roles.forEach((role) => {

        log.process(`Role Setting File : ${role}`);

        // 1. check role file exist, if not create it
        const roleFilePath = `${options.roleSetupDir}/${role}.json`;
        const content: types.roleJson = {};

        if (fs.existsSync(roleFilePath)) {
            Object.assign(content, utils.common.loadJson<types.roleJson>(roleFilePath));
        }


        // 2. check role obejct exist, if not add it in content
        options.collectionList.forEach(collectionName => {
            if (!content[collectionName]) {
                content[collectionName] = actionArray;
            }
        });

        utils.common.writeFile(`Role Setting File : ${roleFilePath}`, roleFilePath, JSON.stringify(content, null, 4));

    });

}

export function roleSchemaFormat(options: {
    compilerOptions: types.compilerOptions
}): void {
    if(!options.compilerOptions.useRBAC){ return; }

    // find schema props with "x-vexData" = "role"
    // if found, update prop format & enum of roles
    options.compilerOptions.useRBAC?.schemaIncluded.forEach((file) => {
        log.process(`Schema Role Formatting : ${file}.json`);

        const roleSchemaPath = `${options.compilerOptions.jsonSchemaDir}/${file}.json`;
        const schema = utils.common.loadJson<types.jsonSchema>(roleSchemaPath);

        for(const key in schema.properties){
            const prop = schema.properties[key];
            if (prop["x-vexData"] === "role") {
                prop.type = "array";
                prop.default = [options.compilerOptions.useRBAC?.default];

                if (!prop.items){
                    prop.items = { type: "" };
                }
                
                prop.items.type = "string";
                prop.items.enum = options.compilerOptions.useRBAC?.roles;
                break;
            }
        }

        utils.common.writeFile("Schema Role Formatting", roleSchemaPath, JSON.stringify(schema, null, 4));

    });

}
