import roleTemplate from "./role.template";
import * as types from "../../types/types";
import * as roleBase from "../../templates/_roles/_RoleFactory";

import utils from "../../utils";
import log from "../../utils/logger";
import { roleSetupFile } from "../../preprocess/roleSetupFile";

import * as RBACmiddlewareGen from "../middlewares/RBACmiddleware.generator";

/**
 * compile role base access control (RBAC) middleware
 * @param options 
 * @returns 
 */
export async function compile(options: {
    collectionList: string[],
    roleSourceDir: string,
    roleOutDir: string,
    middlewareDir: string,
    compilerOptions: types.compilerOptions,
}): Promise<void> {
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
        const roleContent = utils.common.loadJson(roleSrcFile);

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

        utils.common.writeFile("RBAC Role", roleOutFile, roleTemplate({
            role: role,
            roleContent: roleContent,
            RoleAccessActionString: RoleAccessActionString,
            compilerOptions: options.compilerOptions,
        }));

        indexFileData.push({
            name: role, 
            from: roleOutFile,
        });
    });

    // 2. generate index file
    const indexFilePath = `${options.roleOutDir}/index.ts`;
    const indexFileContent = indexFileData.map((data) => `export { default as ${data.name} } from "./${data.name}.gen";`).join("\n");
    utils.common.writeFile("RBAC Index", indexFilePath, `${options.compilerOptions.headerComment}\n${indexFileContent}`);

    // 3. generate RBAC middleware
    const roleTypesString = indexFileData.map((data) => `roles.${data.name}`).join(" | "); 
    RBACmiddlewareGen.compile({
        middlewareDir: options.middlewareDir,
        roleTypes: roleTypesString,
        compilerOptions: options.compilerOptions,
    });
    return;
}