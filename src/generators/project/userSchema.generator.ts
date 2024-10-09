import utils from "./../../utils";
import log from "./../../utils/logger";

import * as types from "./../../types/types";

export async function compile(options: {
    compilerOptions: types.compilerOptions,
}) {
    if (!options.compilerOptions.app.useUserSchema) { return; }

    log.process("UserSchmea");

    // 1. read userSchema file
    const schemaOutPath = `${options.compilerOptions.jsonSchemaDir}/User.json`;
    const templateSchema = utils.common.loadJson(__dirname + "/templates/jsonSchema/User.json");
    const userSchema = utils.common.loadJson(schemaOutPath, () => templateSchema);

    // 2. check userSchema.properties fields as templateSchema
    Object.keys(templateSchema.properties).forEach((key) => {
        if (!userSchema.properties[key]) {
            userSchema.properties[key] = templateSchema.properties[key];
        }

        if (userSchema.properties[key]?.["x-vexData"] == "role") {
            userSchema.properties[key].items.enum = options.compilerOptions.useRBAC?.roles || ["user"];
        }
    });

    // 3. write userSchema file
    utils.common.writeFile("UserSchmea", schemaOutPath, JSON.stringify(userSchema, null, 4));

    return;
}