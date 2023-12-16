export function serverTemplate(headerComment?:string, template?:string, templateOptions?:{
    enableOpenApi?:boolean
    routes: {
        className: string,
        controllerPath: string
    }[]
}) {
    if(!headerComment){
        headerComment = "// generated files by very-express";
    };

    if(!template){
        template = `{{headerComment}}
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

{{importRoutes}}

const router :Router = Router();

{{openapiRoute}}

{{useRoutes}}

export default router;`;
};

    let importRoutes = "";
    let useRoutes = "";
    templateOptions?.routes.forEach(route => {
        importRoutes += `import ${route.className} from '${route.controllerPath}';\n`;
        useRoutes += `router.use('/${route.className.toLowerCase()}', ${route.className});\n`;
    });

    template = template.replace(/{{headerComment}}/g, headerComment);
    template = template.replace(/{{openapiRoute}}/g, templateOptions?.enableOpenApi ? `router.use('/api', swaggerUi.serve, swaggerUi.setup(loadYaml('./output/openapi.yaml') as JsonObject));` : '' );
    template = template.replace(/{{importRoutes}}/g, importRoutes);
    template = template.replace(/{{useRoutes}}/g, useRoutes);

    return template;
};