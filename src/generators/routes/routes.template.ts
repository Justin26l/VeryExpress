import * as types from "../../types/types";

export default function routesTemplate(options: {
    template?: string,
    openapiFile?: string,
    routes: {
        route: string,
        interfaceName: string,
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
    options.routes.forEach((obj) => {
        importRoutes += `import ${obj.interfaceName}Controller from '${obj.controllerPath}';\n`;
        useRoutes += `this.router.use('${obj.route}', ${obj.interfaceName}Controller);\n`;
    });

    template = template.replace(/{{headerComment}}/g, options.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{importRoutes}}/g, importRoutes);
    template = template.replace(/{{useRoutes}}/g, useRoutes);

    return template;
}