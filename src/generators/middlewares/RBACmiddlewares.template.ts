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
        "GET": 'read',
        "POST /": 'create',
        "POST /search": 'search',
        "PUT": 'update',
        "PATCH": 'update',
        "DELETE": 'delete',
    };

    constructor(
        collection: string, 
    ) {
        this.collection = collection;
    }

    public middleware = (req: Request, res: Response, next: NextFunction) => {
        try { 
            log.info("RBAC.middleware", req.method, req.path, req.user);
            if ( !req.user ) {
                throw 401;
            }

            const user :any = req.user;
            const actionKey = req.method !== "POST" ? req.method : \`\${req.method} \${req.path}\`;
            {{roleSwitch}}
        }
        catch (e: any) {
            log.errorNoExit(e);
            if (typeof e === 'number') {
                utils.response.send(res, e);
            }
            else {
                utils.response.send(res, 500, { message: e.errorMessages });
            }
        }
    }
}`;

    let roleSwitchCode = "";
    let counter = 0;
    options.roles.forEach(role => {
        roleSwitchCode += `
            ${ counter == 0 ? "" : "else " }if ( user.roles.includes('${role}') && new roles.${role}().checkAccess(this.collection, this.actions[actionKey]) ) {
                next();
            }`;
        counter++;
    });

    roleSwitchCode += `else{
                throw 403;
            }`;
            
    template = template.replace(/{{roleSwitch}}/g, roleSwitchCode);

    return template;
}