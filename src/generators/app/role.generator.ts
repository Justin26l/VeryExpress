import fs from "fs";

import * as types from "../../types/types";
import * as roleBase from "../../templates/_roles/_RoleFactory";

import log from "../../utils/logger";
import { loadJson, writeFile } from "../../utils";
import { roleSetupFile } from "../../preprocess/roleSetupFile";

export function compile(options: {
    collectionList: string[],
    roleSourceDir: string,
    roleOutDir: string,
    compilerOptions: types.compilerOptions,
}){
    if(!options.compilerOptions.useRBAC){ return; }

    roleSetupFile({
        collectionList: options.collectionList,
        roleSetupDir: options.roleSourceDir,
        compilerOptions: options.compilerOptions
    });

    const indexFileData: { name: string, from: string }[] = [];

    // 1. generate role handler class
    options.compilerOptions.useRBAC?.roles.forEach((role) => {
        log.process(`RBAC Class : ${role}`);

        // 1. get role custom access action not in crud
        const RoleAccessAction : string[] = [];

        const roleSrcFile = `${options.compilerOptions.srcDir}/roles/${role}.json`;
        const roleOutFile = `${options.roleOutDir}/${role}.gen.ts`;
        const roleContent = loadJson(roleSrcFile);

        Object.values(roleContent).forEach((resourceContent: any) => {
            // check is array of string
            if (Array.isArray(resourceContent)) {
                resourceContent.forEach((action: string) => {
                    if (!RoleAccessAction.includes(action) && ! roleBase.accessActionArr.includes(action as any)) {
                        RoleAccessAction.push(action);
                    }
                });
            }
        });

        // make templates
        const RoleAccessActionString = Object.keys(RoleAccessAction).map((key) => `"${key}"`);
        RoleAccessActionString.push("roleFactory.accessAction");

        const content = `${options.compilerOptions.headerComment}
import * as roleFactory from "./../system/_RoleFactory.gen";

export type accessAction${role} = ${RoleAccessActionString.join(" | ")};

const ${role}AccessControl: roleFactory.accessControl<accessAction${role}> = ${JSON.stringify(roleContent, null, 4)};

export default class Role${role} extends roleFactory._RoleFactory<accessAction${role}> {
    constructor() {
        super(${role}AccessControl);
    }
}
`;

        writeFile("RBAC Role", roleOutFile, content);
        indexFileData.push({
            name: role, 
            from: roleOutFile,
        });
    });

    // 2. generate index file
    const indexFile = `${options.roleOutDir}/index.ts`;
    const indexFileContent = indexFileData.map((data) => `export { default as ${data.name} } from "./${data.name}.gen";`).join("\n");
    writeFile("RBAC Index", indexFile, `${options.compilerOptions.headerComment}\n${indexFileContent}`);

    // 3. generate middleware
    // 3.1. create if middeleware dir not exist
    if (!fs.existsSync(`${options.compilerOptions.sysDir}/_middlewares`)) {
        fs.mkdirSync(`${options.compilerOptions.sysDir}/_middlewares`);
    }
    // 3.2. generate middleware file
    const middlewareFile = `${options.compilerOptions.sysDir}/_middlewares/RoleBaseAccessControl.gen.ts`;
    const roleTypes = indexFileData.map((data) => `typeof roles.${data.name}`).join(" | ");
    const middlewareContent = `${options.compilerOptions.headerComment}
import { Request, Response, NextFunction } from "express";
import * as roles from "../_roles";

export { roles };

export function roleBaseAccessControl(
    role: ${roleTypes}, 
    collection: string, 
    action: string
) {
    return function (req: Request, res: Response, next: NextFunction) {
        if ( new role().checkAccess(collection, action) ) {
            next();
        }
        else {
            res.status(403).send("Permission denied");
        }
    };
}`;
    writeFile("RBAC Middleware", middlewareFile, middlewareContent);

}