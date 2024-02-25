import fs from "fs";
import util from "util";

import * as types from "../types/types";
import * as roleBase from "../templates/roles/Role";

import log from "../utils/logger";
import { loadJson } from "../utils";

export function compile(options: {
    roleOutDir: string,
    compilerOptions: types.compilerOptions,
}){
    options.compilerOptions.app.roles.forEach((role) => {
        log.process(`RBAC Class : ${role}`);

        // 1. get role custom access action not in crud
        const RoleAccessAction : string[] = [];

        const roleFilePath = `${options.compilerOptions.rootDir}/roles/${role}.json`;
        const roleOutFile = `${options.roleOutDir}/${role}.gen.ts`;
        const roleContent = loadJson(roleFilePath);

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
        RoleAccessActionString.push("role.accessAction");

        const content = `${options.compilerOptions.headerComment}
import * as role from "./Role.gen";

export type accessAction${role} = ${RoleAccessActionString.join(" | ")};

const ${role}Access: role.accessObject<accessAction${role}> = ${JSON.stringify(roleContent, null, 4)};

export default class Role${role} extends role.Role<accessAction${role}> {
    constructor() {
        super(${role}Access);
    }
}`;

        log.writing(`RBAC Class : ${roleOutFile}`);
        fs.writeFileSync(`${roleOutFile}`, content);
    });
}