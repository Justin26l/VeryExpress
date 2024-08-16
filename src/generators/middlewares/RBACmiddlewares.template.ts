import * as types from "../../types/types";

export default function RBACmiddlewareTemplate(options: {
    template?: string,
    roles: string[],
    compilerOptions: types.compilerOptions,
}): string {

    let template: string = options.template || `{{headerComment}}
import { Request, Response, NextFunction } from "express";
import * as roles from "../_roles";
import Log from "../_utils/logger.gen";

export { roles };

export default class RoleBaseAccessControl {
    private collection: string;
    private actions: {[key:string]: string} = {
        GET: 'read',
        POST: 'create',
        PUT: 'update',
        PATCH: 'update',
        DELETE: 'delete',
    };

    constructor(
        collection: string, 
    ) {
        this.collection = collection;
    }

    public middleware = (req: Request, res: Response, next: NextFunction) => {
        try { 
            Log.info(req.method, req.path, req.user);
            if ( !req.user ) {
                throw 401;
            }

            const user :any = req.user;
            {{roleSwitch}}
        }
        catch (e) {
            Log.errorNoExit(e);
            if (typeof e === 'number') {
                res.status(e).send("Permission denied");
            }
            else {
                res.status(500).send("Internal server error");
            }
        }
    }
}`;

    let roleSwitchCode = "";
    let counter = 0;
    options.roles.forEach(role => {
        roleSwitchCode += `
            ${ counter == 0 ? "" : "else " }if ( user.roles.includes('${role}') && new roles.${role}().checkAccess(this.collection, this.actions[req.method]) ) {
                next();
            }`;
        counter++;
    });

    roleSwitchCode += `else{
                throw 403;
            }`;
    // if ( user.roles.includes('visitor') && new roles.visitor().checkAccess(this.collection, this.actions[req.method]) ) {
    //     next();
    // }
    // else if ( user.roles.includes('member') && new roles.member().checkAccess(this.collection, this.actions[req.method]) ) {
    //     next();
    // }
    // else{
    //     throw 403;
    // }

    template = template.replace(/{{headerComment}}/g, options.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{roleSwitch}}/g, roleSwitchCode);

    return template;
}