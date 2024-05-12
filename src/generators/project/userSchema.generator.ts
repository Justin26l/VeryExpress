import * as types from "../../types/types";

import log from "../../utils/logger";
import { loadJson, relativePath, writeFile } from "../../utils";

export function compile(options: {
    compilerOptions: types.compilerOptions,
}){
    if(!options.compilerOptions.app.useUserSchema){ return; }

    log.process("UserSchmea");
    
    // 1. read userSchema file
    const schemaOutPath = `${options.compilerOptions.jsonSchemaDir}/User.json`;
    const templateSchema = loadJson(relativePath(options.compilerOptions.rootDir, "~/templates/jsonSchema/User.json"));
    const userSchema = loadJson(schemaOutPath, ()=>{
        return templateSchema;
    });

    // 2. check userSchema.properties fields as templateSchema
    Object.keys(templateSchema.properties).forEach((key)=>{
        if(!userSchema.properties[key]){
            userSchema.properties[key] = templateSchema.properties[key];
            if ( key == "role" ){
                userSchema.properties[key].enum = options.compilerOptions.useRBAC?.roles || ["user"];
            }
        }
    });

    // 3. write userSchema file
    writeFile("UserSchmea", schemaOutPath, JSON.stringify(userSchema, null, 4));
}