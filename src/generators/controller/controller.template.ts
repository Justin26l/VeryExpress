import * as types from "../../types/types";
import { ZodSchemaDef, ZodFieldDef } from "./controllers.generator";
import utils from "~/utils";

export default function controllerTemplate(templateOptions: {
    template?:string, 
    endpoint: string,
    modelPath: string,
    documentName: string,
    validators: {
        [key:string]: {
            [key:string]: ZodSchemaDef
        }
    },
    compilerOptions: types.compilerOptions,
}) : string {
    let template :string = templateOptions.template || `{{headerComment}}
import * as controllerFactory from "./_ControllerFactory.gen";
import { Router, Request, Response, NextFunction } from 'express';
import { FindOptionsWhere, DeepPartial, Repository } from 'typeorm';

import { z } from 'zod';
import { oasRegistry, {{documentName}}BodySchema, {{documentName}}ParamsSchema } from '../_routes/OasRegistry.gen';
import utils from "./../../system/_utils";
import VexSystem from '../_services/VexSystem.gen';
import VexResponseError from "../_types/VexResponseError.gen";
import VexDb from '../_services/VexDb.gen';

import { {{documentName}}Entity } from '{{modelPath}}';

class {{documentName}}Controller extends controllerFactory._ControllerFactory {
    public router: Router;
    private vexSystem: VexSystem;
    private get repo(): Repository<{{documentName}}Entity> {
        return VexDb.getRepository({{documentName}}Entity);
    }

    constructor() {
        super();
        this.router = Router();
        this.vexSystem = new VexSystem();
        this.routes();
    }

    public routes() {
        
        {{getListRoute}}
        {{getRoute}}
        {{postRoute}}
        {{putRoute}}
        {{patchRoute}}
        {{deleteRoute}}
        {{oasRegisterPaths}}

    }

    public async get{{documentName}}(req: Request, res: Response): Promise<Response> {
        const result = await this.repo.findOne({ where: { _id: req.params.id } as FindOptionsWhere<{{documentName}}Entity> });
        if (!result) throw new VexResponseError(404, utils.response.code.err_not_found);
        
        return utils.response.send(res, 200, { result });
    }

    protected async getList{{documentName}}(req: Request, res: Response): Promise<Response> {
        const searchFilter = req.body._filter;
        const selectedFields = utils.common.parseFieldsSelect(req);
        const relations = utils.common.parseRelations(req);

        const result = await this.repo.find({
            where: searchFilter,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            select: selectedFields as any,
            relations: relations,
        });
        return utils.response.send(res, 200, { result });
    }

    public async create{{documentName}}(req: Request, res: Response): Promise<Response> {
        {{clean_id}}

        const result = await this.repo.save(this.repo.create(req.body as DeepPartial<{{documentName}}Entity>));
        if (!result) throw new VexResponseError(400, utils.response.code.err_create);
        
        return utils.response.send(res, 201, { result });
    }

    public async update{{documentName}}(req: Request, res: Response): Promise<Response> {
        {{clean_id}}

        await this.repo.update({ _id: req.params.id } as FindOptionsWhere<{{documentName}}Entity>, req.body as DeepPartial<{{documentName}}Entity>);
        const result = await this.repo.findOne({ where: { _id: req.params.id } as FindOptionsWhere<{{documentName}}Entity> });
        if (!result) throw new VexResponseError(404, utils.response.code.err_update);
        
        return utils.response.send(res, 200, { result });
    }

    public async replace{{documentName}}(req: Request, res: Response): Promise<Response> {
        {{clean_id}}

        const existing = await this.repo.findOne({ where: { _id: req.params.id } as FindOptionsWhere<{{documentName}}Entity> });
        if (!existing) throw new VexResponseError(404, utils.response.code.err_update);
        const result = await this.repo.save(this.repo.merge(existing, req.body as DeepPartial<{{documentName}}Entity>));

        return utils.response.send(res, 200, { result });
    }

    public async delete{{documentName}}(req: Request, res: Response): Promise<Response> {
        const existing = await this.repo.findOne({ where: { _id: req.params.id } as FindOptionsWhere<{{documentName}}Entity> });
        if (!existing) throw new VexResponseError(404, utils.response.code.err_delete);
        await this.repo.delete({ _id: req.params.id } as FindOptionsWhere<{{documentName}}Entity>);
        
        return utils.response.send(res, 204, { result: existing });
    }
}

export default new {{documentName}}Controller();
`;
    
    /** Renders a Zod validation middleware from a ZodSchemaDef for a given location */
    function renderZodMiddleware(schemaDef: ZodSchemaDef, location: "body" | "params" | "query"): string {
        const entries = Object.keys(schemaDef).map(k => [k, schemaDef[k]] as [string, ZodFieldDef]);
        const fields = entries.filter(([, def]) => def.in === location);
        if (fields.length === 0) return "";

        const shape = fields
            .filter(([field]) => !field.includes("."))
            .map(([field, def]) => `${JSON.stringify(field)}: ${def.chain}`)
            .join(",\n                ");

        const source = location === "body" ? "req.body" : location === "params" ? "req.params" : "req.query";

        return `
        /** Zod validation: ${location} */
        ((req: Request, res: Response, next: NextFunction) => {
            const result = z.object({
                ${shape}
            }).safeParse(${source});
            if (!result.success) {
                return res.status(400).json({ errors: result.error.flatten() });
            }
            next();
        }),`;
    }

    function renderRouteMiddlewares(schemaDef: ZodSchemaDef): string {
        return [
            renderZodMiddleware(schemaDef, "params"),
            renderZodMiddleware(schemaDef, "query"),
            renderZodMiddleware(schemaDef, "body"),
        ].filter(Boolean).join("");
    }

    function renderOasRegisterPath(method: string, oasPath: string, summary: string, hasBody: boolean, hasParams: boolean): string {
        const docName = templateOptions.documentName;
        const requestParts: string[] = [];
        if (hasParams) requestParts.push(`            params: ${docName}ParamsSchema,`);
        if (hasBody) requestParts.push(
            `            body: {`,
            `                content: { "application/json": { schema: ${docName}BodySchema } },`,
            `                description: "Request body",`,
            `            },`
        );
        const requestBlock = requestParts.length
            ? `\n            request: {\n${requestParts.join("\n")}\n            },`
            : "";
        return `
        oasRegistry.registerPath({
            method: "${method}",
            path: "${oasPath}",
            summary: "${summary}",
            security: [{ BearerAuth: [] }],${requestBlock}
            responses: {
                200: { description: "Success" },
                400: { description: "Validation Error" },
                401: { description: "Unauthorized" },
                404: { description: "Not Found" },
            },
        });`;
    }

    const v = templateOptions.validators;
    const ep = templateOptions.endpoint;
    const dn = templateOptions.documentName;
    const oasRegisterPaths = [
        v[ep + "/search"]?.post  ? renderOasRegisterPath("post",   `${ep}/search`, `Search ${dn}`,  false, false) : "",
        v[ep]?.post              ? renderOasRegisterPath("post",   ep,            `Create ${dn}`,  true,  false) : "",
        v[ep + "/{id}"]?.get     ? renderOasRegisterPath("get",    `${ep}/{id}`,  `Get ${dn}`,     false, true)  : "",
        v[ep + "/{id}"]?.put     ? renderOasRegisterPath("put",    `${ep}/{id}`,  `Replace ${dn}`, true,  true)  : "",
        v[ep + "/{id}"]?.patch   ? renderOasRegisterPath("patch",  `${ep}/{id}`,  `Update ${dn}`,  true,  true)  : "",
        v[ep + "/{id}"]?.delete  ? renderOasRegisterPath("delete", `${ep}/{id}`,  `Delete ${dn}`,  false, true)  : "",
    ].filter(Boolean).join("\n");

    template = template.replace(/{{documentName}}/g, templateOptions.documentName);
    template = template.replace(/{{modelPath}}/g, templateOptions.modelPath);

    template = template.replace(
        /{{getListRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/search"]?.post ? `
        // getListRoute disabled` : `
        this.router.post('/search',
            this.vexSystem.RouteHandler(this.getList${templateOptions.documentName}.bind(this))
        );`
    );

    template = template.replace(
        /{{getRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"]?.get ? `
        // getRoute disabled` : `
        this.router.get('/:id', ${renderRouteMiddlewares(templateOptions.validators[templateOptions.endpoint+"/{id}"].get)}
            this.vexSystem.RouteHandler((this.get${templateOptions.documentName}.bind(this)))
        );`
    );

    template = template.replace(
        /{{postRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint]?.post ? `
        // postRoute disabled` : `
        this.router.post('/', ${renderRouteMiddlewares(templateOptions.validators[templateOptions.endpoint].post)}
            this.vexSystem.RouteHandler((this.create${templateOptions.documentName}.bind(this)))
        );`
    );

    template = template.replace(
        /{{putRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"]?.put ? `
        // putRoute disabled` : `
        this.router.put('/:id', ${renderRouteMiddlewares(templateOptions.validators[templateOptions.endpoint+"/{id}"].put)}
            this.vexSystem.RouteHandler((this.replace${templateOptions.documentName}.bind(this)))
        );`
    );
    template = template.replace(
        /{{patchRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"]?.patch ? `
        // patchRoute disabled` : `
        this.router.patch('/:id', ${renderRouteMiddlewares(templateOptions.validators[templateOptions.endpoint+"/{id}"].patch)}
            this.vexSystem.RouteHandler((this.update${templateOptions.documentName}.bind(this)))
        );`
    );

    template = template.replace(
        /{{deleteRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"]?.delete ? `
        // deleteRoute disabled` : `
        this.router.delete('/:id', ${renderRouteMiddlewares(templateOptions.validators[templateOptions.endpoint+"/{id}"].delete)}
            this.vexSystem.RouteHandler((this.delete${templateOptions.documentName}.bind(this)))
        );`
    );

    template = template.replace(
        /{{clean_id}}/g, 
        templateOptions.compilerOptions.app.allowApiCreateUpdate_id ? "" : "if (req.body._id) delete req.body._id;"
    );

    template = template.replace(/{{oasRegisterPaths}}/g, oasRegisterPaths);

    return utils.template.format(template);
}