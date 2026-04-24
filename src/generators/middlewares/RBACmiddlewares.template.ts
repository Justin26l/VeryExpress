import * as types from "../../types/types";

export default function RBACmiddlewareTemplate(options: {
    template?: string,
    roles: string[],
    compilerOptions: types.compilerOptions,
}): string {

    let template: string = options.template || `{{headerComment}}
import { Request, Response, NextFunction } from "express";
import * as roles from "../_roles";
import utils from "../_utils";
import log from "../_utils/logger.gen";

export { roles };

export default class RoleBaseAccessControl {
    private collection: string;
    private actions: {[key:string]: string} = {
        "GET": "read",
        "POST /": "create",
        "POST /search": "search",
        "PUT": "update",
        "PATCH": "update",
        "DELETE": "delete",
    };

    constructor(
        collection: string, 
    ) {
        this.collection = collection;
    }

    public middleware = (req: Request, res: Response, next: NextFunction) => {
        // log.info("RBAC.middleware", req.method, req.path, req.user);
        if ( !req.user ) {
            throw new VexResponseError(401);
        }
        const user :any = req.user;
        const actionKey = req.method !== "POST" ? req.method : \`\${req.method} \${req.path}\`;
        {{roleSwitch}}
};
}`;

    let roleSwitch = "";
    let counter = 0;
    options.roles.forEach(role => {
        roleSwitch += `
            ${ counter == 0 ? "" : "else " }if ( user.roles.includes("${role}") && new roles.${role}().checkAccess(this.collection, this.actions[actionKey]) ) {
                next();
            }`;
        counter++;
    });

    roleSwitch += `else {
                throw new VexResponseError(403);
            }`;
            
    template = template.replace(/{{roleSwitch}}/g, roleSwitch);

    return template;
}