import * as types from "../../types/types";
import * as utilsGenerator from "./../../utils/generator";

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

    private router: Router = Router();

    constructor() {
        {{useRoutes}}
    }

    public getRouter() {
        return this.router;
    }

}`;

    const importRoutes = [];
    const useRoutes = [];

    const rbacMiddleware = (path: string) => {
        return options.compilerOptions.useRBAC ? `new RoleBaseAccessControl('${path}').middleware, ` : "";
    };

    if (options.compilerOptions.useRBAC) {
        importRoutes.push("import RoleBaseAccessControl from '../_middlewares/RoleBaseAccessControl.gen';");
    }
    if (utilsGenerator.isOAuthEnabled(options.compilerOptions)) {
        importRoutes.push("import Authentication from '../_middlewares/Authentication.gen';");
        useRoutes.push("this.router.use(new Authentication().middleware);");
    }

    options.routes.forEach((obj) => {
        importRoutes.push(`import ${obj.documentName}Controller from '${obj.controllerPath}';`);
        useRoutes.push(`this.router.use('${obj.route}', ${rbacMiddleware(obj.documentName)} ${obj.documentName}Controller);`);
    });

    template = template.replace(/{{headerComment}}/g, options.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{importRoutes}}/g, importRoutes.join("\n"));
    template = template.replace(/{{useRoutes}}/g, useRoutes.join("\n        "));

    return template;
}