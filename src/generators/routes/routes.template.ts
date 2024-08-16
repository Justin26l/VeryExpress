import * as types from "../../types/types";

export default function routesTemplate(options: {
    template?: string,
    openapiFile?: string,
    routes: {
        route: string,
        documentName: string,
        controllerPath: string,
    }[],
    compilerOptions: types.compilerOptions,
}): string {

    let template: string = options.template || `{{headerComment}}
import { Router } from 'express';

{{importRoutes}}

export default class ApiRouter{

    public router: Router = Router();

    constructor() {}

    public initRoutes() {

{{useRoutes}}
    }

}`;

    let importRoutes = "";
    let useRoutes = "";

    const rbacMiddleware = (path: string) => {
        return options.compilerOptions.useRBAC ? `new RoleBaseAccessControl('${path}').middleware, ` : "";
    };

    if (options.compilerOptions.useRBAC) {
        importRoutes += "import RoleBaseAccessControl from '../_middlewares/RoleBaseAccessControl.gen';\n";

    }

    options.routes.forEach((obj) => {
        importRoutes += `import ${obj.documentName}Controller from '${obj.controllerPath}';\n`;
        useRoutes += `        this.router.use('${obj.route}', ${rbacMiddleware(obj.documentName)} ${obj.documentName}Controller);\n`;
    });

    template = template.replace(/{{headerComment}}/g, options.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{importRoutes}}/g, importRoutes);
    template = template.replace(/{{useRoutes}}/g, useRoutes);

    return template;
}