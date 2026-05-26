import * as types from "../../types/types";

export default function RBACmiddlewareTemplate(options: {
    template?: string,
    roles: string[],
    compilerOptions: types.compilerOptions,
}): string {

    let template: string = options.template || `{{headerComment}}
import { Request, Response, NextFunction } from "express";
import * as roles from "../_roles";
import { VexResErr } from "../_types/vex";
import log from "../_utils/logger.gen";

export { roles };

class RoleBaseAccessControl {
    private static actions: {[key:string]: string} = {
        "GET": "read",
        "POST /": "create",
        "POST /search": "search",
        "PUT": "update",
        "PATCH": "update",
        "DELETE": "delete",
    };


    public middleware(collection: string) {
        return (req: Request, res: Response, next: NextFunction) => {
            // log.info("RBAC.middleware", req.method, req.path, req.user);
            if ( !req.user ) {
                throw new VexResErr(401);
            }

            const user :any = req.user;
            const actionKey = req.method !== "POST" ? req.method : req.path.endsWith("/search") ? "POST /search" : "POST /";
            {{roleSwitch}}
        }
    };
}

export default new RoleBaseAccessControl()
`;

    let roleSwitch = "";
    let counter = 0;
    options.roles.forEach(role => {
        roleSwitch += `
            ${ counter == 0 ? "" : "else " }if ( user.roles.includes("${role}") && new roles.${role}().checkAccess(collection, RoleBaseAccessControl.actions[actionKey]) ) {
                next();
            }`;
        counter++;
    });

    roleSwitch += `else {
                throw new VexResErr(403);
            }`;
    template = template.replace(/{{roleSwitch}}/g, roleSwitch);

    return template;
}