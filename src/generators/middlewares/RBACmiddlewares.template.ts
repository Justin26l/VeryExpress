import * as types from "../../types/types";

export default function RBACmiddlewareTemplate(options: {
    template?: string,
    roleTypes: string,
    compilerOptions: types.compilerOptions,
}): string {

    let template: string = options.template || `{{headerComment}}
import { Request, Response, NextFunction } from "express";
import * as roles from "../_roles";
import session from "express-session";

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
            console.log(req.method, req.path, req.user);
            if ( !req.user ) {
                throw 401;
            }

            const user :any = req.user;
            
            // here, hard code
            if ( user.roles.includes('visitor') && new roles.visitor().checkAccess(this.collection, this.actions[req.method]) ) {
                next();
            }
            else if ( user.roles.includes('member') && new roles.member().checkAccess(this.collection, this.actions[req.method]) ) {
                next();
            }
            else{
                throw 403;
            }
        }
        catch (e) {
        console.error(e);
            if (typeof e === 'number') {
                res.status(e).send("Permission denied");
            }
            else {
                res.status(500).send("Internal server error");
            }
        }
    }
}`;

    template = template.replace(/{{headerComment}}/g, options.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{roleTypes}}/g, options.roleTypes);

    return template;
}