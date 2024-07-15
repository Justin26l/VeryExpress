import RBACmiddlewareTemplate from "./RBACmiddlewares.template";
import fs from "fs";

import utils from "../../utils";
import log from "../../utils/logger";

import * as types from "../../types/types";

/**
 * compile role base access control (RBAC) middleware
 * @param middlewareDir
 * @param roleTypes
 * @param compilerOptions
 */
export async function compile(options: {
    middlewareDir: string,
    roleTypes: string,
    compilerOptions: types.compilerOptions
}): Promise<void> {

    log.process("RBAC Middleware");

    // 1. create if middeleware dir not exist
    if (!fs.existsSync(options.middlewareDir)) {
        fs.mkdirSync(options.middlewareDir);
    }
    // 2. generate middleware file
    const middlewareFilePath = `${options.middlewareDir}/RoleBaseAccessControl.gen.ts`;
    utils.common.writeFile("RBAC Middleware", middlewareFilePath, RBACmiddlewareTemplate({
        roleTypes: options.roleTypes,
        compilerOptions: options.compilerOptions,
    }));

}