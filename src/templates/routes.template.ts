import * as types from '../types/types';

export default function routesTemplate(templateOptions: {
    headerComment?: string,
    template?: string,
    controllerPath: string[],
    enableOpenApi?: boolean,
    options: types.compilerOptions,
}): string {
    if (!templateOptions.headerComment) {
        templateOptions.headerComment = templateOptions.options?.headerComment || "// generated files by very-express";
    };

    let headerComment : string = templateOptions.options?.headerComment || "// generated files by very-express";

    let template: string = templateOptions.template || `{{headerComment}}
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

{{importRoutes}}

const router :Router = Router();

{{openapiRoute}}

{{useRoutes}}

export default router;`;

    let importRoutes = "";
    let useRoutes = "";
    templateOptions?.controllerPath.forEach((path: string) => {
        const className: string | undefined = path.split('/').pop();
        importRoutes += `import ${className} from '${path}';\n`;
        useRoutes += `router.use('/${className?.toLowerCase()}', ${className});\n`;
    });

    template = template.replace(/{{headerComment}}/g, headerComment);
    template = template.replace(/{{importRoutes}}/g, importRoutes);
    template = template.replace(/{{openapiRoute}}/g, templateOptions?.enableOpenApi ? `router.use('/api', swaggerUi.serve, swaggerUi.setup(loadYaml('./output/openapi.yaml') as JsonObject));` : '');
    template = template.replace(/{{useRoutes}}/g, useRoutes);

    return template;
};