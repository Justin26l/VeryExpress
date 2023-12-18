import * as types from '../types/types';

export default function routesTemplate(templateOptions: {
    headerComment?: string,
    template?: string,
    enableOpenApi?: boolean,
    openapiPath?: string,
    routes: {
        route: string,
        controllerClassName: string,
        controllerPath: string,
    }[],
    options?: types.compilerOptions,
}): string {
    if (!templateOptions.headerComment) {
        templateOptions.headerComment = templateOptions.options?.headerComment || "// generated files by very-express";
    };

    let enableOpenApi = templateOptions.enableOpenApi || true;
    // required openapiPath if enableOpenApi is true
    if (enableOpenApi && !templateOptions.openapiPath) {
        // log red
        console.log('\x1b[31m%s\x1b[0m', '[Error]', 'OpenApi : routers.generator > compile() : Args "openapiPath" is required while enableOpenApi is true.');
        throw new Error('OpenApi : routers.generator > compile() : Args "openapiPath" is required while enableOpenApi is true.');
    };

    let headerComment : string = templateOptions.options?.headerComment || "// generated files by very-express";

    let template: string = templateOptions.template || `{{headerComment}}
import { Router } from 'express';
import swaggerUi, { JsonObject } from 'swagger-ui-express';
import { loadYaml } from '../utils/common.gen';

{{importRoutes}}

const router :Router = Router();

{{openapiRoute}}

{{useRoutes}}

export default router;`;

    let importRoutes = "";
    let useRoutes = "";
    templateOptions?.routes.forEach((obj) => {
        importRoutes += `import ${obj.controllerClassName} from '${obj.controllerPath}';\n`;
        useRoutes += `router.use('${obj.route}', ${obj.controllerClassName});\n`;
    });

    template = template.replace(/{{headerComment}}/g, headerComment);
    template = template.replace(/{{importRoutes}}/g, importRoutes);
    template = template.replace(/{{openapiRoute}}/g, enableOpenApi ? `router.use('/api', swaggerUi.serve, swaggerUi.setup(loadYaml('${templateOptions.openapiPath}') as JsonObject));` : '');
    template = template.replace(/{{useRoutes}}/g, useRoutes);

    return template;
};