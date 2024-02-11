import * as types from "../types/types";
import * as utils from "../utils/common";

export default function routesTemplate(templateOptions: {
    template?: string,
    openapiFile?: string,
    enableOpenApi?: boolean,
    routes: {
        route: string,
        interfaceName: string,
        controllerPath: string,
    }[],
    compilerOptions: types.compilerOptions,
}): string {
    if (!templateOptions.compilerOptions.headerComment) {
        templateOptions.compilerOptions.headerComment = templateOptions.compilerOptions.headerComment || "// generated files by very-express";
    }

    const enableOpenApi = templateOptions.enableOpenApi || true;
    // required openapiPath if enableOpenApi is true
    if (enableOpenApi && !templateOptions.compilerOptions.openapiDir) {
        // log red
        console.log("\x1b[31m%s\x1b[0m", "[Error]", "OpenApi : routers.generator > compile() : Args \"openapiPath\" is required while enableOpenApi is true.");
        throw new Error("OpenApi : routers.generator > compile() : Args \"openapiPath\" is required while enableOpenApi is true.");
    }

    const headerComment : string = templateOptions.compilerOptions?.headerComment || "// generated files by very-express";

    let template: string = templateOptions.template || `{{headerComment}}
import { Router } from 'express';
import { loadYaml } from '../utils/common.gen';

{{importRoutes}}

export default class ApiRouter{

    public router: Router = Router();

    constructor() {}

    public initRoutes() {

        {{useRoutes}}

    }

}`

    let importRoutes = "";
    let useRoutes = "";
    templateOptions?.routes.forEach((obj) => {
        importRoutes += `import ${obj.interfaceName}Controller from '${obj.controllerPath}';\n`;
        useRoutes += `this.router.use('${obj.route}', ${obj.interfaceName}Controller);\n`;
    });

    template = template.replace(/{{headerComment}}/g, headerComment);
    template = template.replace(/{{importRoutes}}/g, importRoutes);
    template = template.replace(/{{useRoutes}}/g, useRoutes);

    return template;
}