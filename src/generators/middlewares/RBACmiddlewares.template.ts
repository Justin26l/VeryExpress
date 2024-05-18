import * as types from "../../types/types";

export default function RBACmiddlewareTemplate(options: {
    template?: string,
    roleTypes: string,
    compilerOptions: types.compilerOptions,
}): string {

    let template: string = options.template || `{{headerComment}}
import { Request, Response, NextFunction } from "express";
import * as roles from "../_roles";

export { roles };

export function roleBaseAccessControl(
    role: {{roleTypes}}, 
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

    template = template.replace(/{{headerComment}}/g, options.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{roleTypes}}/g, options.roleTypes);

    return template;
}