import util from "util";
import * as types from "../../types/types";
import { Schema } from "express-validator";
import utils from "~/utils";

export default function controllerTemplate(templateOptions: {
    template?:string, 
    endpoint: string,
    modelPath: string,
    documentName: string,
    populateOptions?: types.populateOptions
    validators: {
        [key:string]: {
            [key:string]: Schema
        }
    },
    compilerOptions: types.compilerOptions,
}) : string {
    let template :string = templateOptions.template || `{{headerComment}}
import * as controllerFactory from "./_ControllerFactory.gen";
import { Router, Request, Response } from 'express';

import { checkSchema, validationResult } from 'express-validator';
import utils from "./../../system/_utils";
import VexSystem from '../_services/VexSystem.gen';
import VexResponseError from "../_types/VexResponseError.gen";

import { {{documentName}}Model } from '{{modelPath}}';

class {{documentName}}Controller extends controllerFactory._ControllerFactory {
    public router: Router;
    private vexSystem: VexSystem;

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

    };

    public async get{{documentName}}(req: Request, res: Response): Promise<Response> {
        const validationError = validationResult(req);
        if ( ! validationError.isEmpty() ) {
            return utils.response.send(res, 400, {
                code: utils.response.code.err_validation, 
                result: validationError.array()
            });
        };

        const result = await {{documentName}}Model.findById(req.params.id){{populateAll}};
        if (!result) {
            return utils.response.send(res, 404);
        }
        else {
            return utils.response.send(res, 200, { result });
        };
    }

    public async getList{{documentName}}(req: Request, res: Response): Promise<Response> {
        const searchFilter = req.body._filter;
        const selectedFields = utils.common.parseFieldsSelect(req);
        const populateOptions = utils.common.parseCollectionJoin(req, {{populateOptions}});

        let query = {{documentName}}Model.find(searchFilter, selectedFields);
        if (populateOptions && Array.isArray(populateOptions) && populateOptions.length > 0) {
            query = query.populate(populateOptions);
        }
        const result = await query;
        return utils.response.send(res, 200, { result });
    }

    public async create{{documentName}}(req: Request, res: Response): Promise<Response> {
        const validationError = validationResult(req);
        if ( ! validationError.isEmpty() ) {
            return utils.response.send(res, 400, {
                code: utils.response.code.err_validation, 
                result: validationError.array()
            });
        };{{check_id}}
        
        const result = await {{documentName}}Model.create(req.body);
        if (!result) {
            return utils.response.send(res, 400, {
                code: utils.response.code.err_create
            });
        }
        else {
            return utils.response.send(res, 201, {result});
        };
    };

    public async update{{documentName}}(req: Request, res: Response): Promise<Response> {
        const validationError = validationResult(req);
        if ( ! validationError.isEmpty() ) {
            return utils.response.send(res, 400, {
                code: utils.response.code.err_validation, 
                result: validationError.array()
            });
        };{{check_id}}

        const result = await {{documentName}}Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!result) {
            return utils.response.send(res, 404, {
                code: utils.response.code.err_update
            });
        }
        else {
            return utils.response.send(res, 200, { result });
        };
    }

    public async replace{{documentName}}(req: Request, res: Response): Promise<Response> {
        const validationError = validationResult(req);
        if ( ! validationError.isEmpty() ) {
            return utils.response.send(res, 400, {
                code: utils.response.code.err_validation, 
                result: validationError.array()
            });
        };{{check_id}}
        
        const result = await {{documentName}}Model.replaceOne({_id: req.params.id}, req.body);
        if (!result) {
            return utils.response.send(res, 404, { 
                code: utils.response.code.err_update
            });
        }
        else {
            return utils.response.send(res, 200, { result });
        };
    }

    public async delete{{documentName}}(req: Request, res: Response): Promise<Response> {
        const validationError = validationResult(req);
        if ( ! validationError.isEmpty() ) {
            return utils.response.send(res, 400, {
                code: utils.response.code.err_validation, 
                result: validationError.array()
            });
        };
        
        const result = await {{documentName}}Model.findByIdAndDelete(req.params.id);
        if (!result) {
            return utils.response.send(res, 404, {
                code: utils.response.code.err_delete
            });
        }
        else {
            return utils.response.send(res, 204, { result });
        };
    }
}

export default new {{documentName}}Controller().router;
`;
    
    const indent = "    ";
    const indent2 = indent+indent;
    const indent3 = indent2+indent;
    const indent4 = indent3+indent;

    template = template.replace(/{{documentName}}/g, templateOptions.documentName);
    template = template.replace(/{{modelPath}}/g, templateOptions.modelPath);

    template = template.replace(
        /{{getListRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/search"]?.post ? `
        // getListRoute disabled` : `
        this.router.post('/search', (req, res) => this.vexSystem.RouteHandler(req, res, () =>  
            this.getList${templateOptions.documentName}(req,res)
        ));`
    );

    // populate options
    let populateTemplate = "";
    if(templateOptions.populateOptions){
        const populateParam: string = JSON.stringify(Object.keys(templateOptions.populateOptions));
        populateTemplate = Object.keys(templateOptions.populateOptions).length>0 ? `\n${indent4}.populate(${ populateParam })` : "";
    }
    template = template.replace(/{{populateAll}}/g, populateTemplate);

    template = template.replace(/{{populateOptions}}/g, JSON.stringify(templateOptions.populateOptions));
    
    template = template.replace(
        /{{getRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"]?.get ? `
        // getRoute disabled` : `
        this.router.get('/:id', (req, res) => {
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].get, { depth: null }).replace(/^/gm, indent3) });
            return this.vexSystem.RouteHandler(req, res, () => 
                this.get${templateOptions.documentName}(req,res)
            );
        });`
    );

    template = template.replace(
        /{{postRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint]?.post ? `
        // postRoute disabled` : `
        this.router.post('/', (req, res) => {
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint].post, { depth: null }).replace(/^/gm, indent3) });
            return this.vexSystem.RouteHandler(req, res, () => 
                this.create${templateOptions.documentName}(req,res)
            );
        });`
    );

    template = template.replace(
        /{{putRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"]?.put ? `
        // putRoute disabled` : `
        this.router.put('/:id', (req, res) => {
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].put, { depth: null }).replace(/^/gm, indent3) });
            return this.vexSystem.RouteHandler(req, res, () => 
                this.replace${templateOptions.documentName}(req,res)
            );
        });`
    );
    template = template.replace(
        /{{patchRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"]?.patch ? `
        // patchRoute disabled` : `
        this.router.patch('/:id', (req, res) => {
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].patch, { depth: null }).replace(/^/gm, indent3) });
            return this.vexSystem.RouteHandler(req, res, () => 
                this.update${templateOptions.documentName}(req,res)
            );
        });`
    );

    template = template.replace(
        /{{deleteRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"]?.delete ? `
        // deleteRoute disabled` : `
        this.router.delete('/:id', (req, res) => {
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].delete, { depth: null }).replace(/^/gm, indent3) });
            return this.vexSystem.RouteHandler(req, res, () => 
                this.delete${templateOptions.documentName}(req,res)
            );
        });`
    );

    template = template.replace(
        /{{check_id}}/g, 
        templateOptions.compilerOptions.app.allowApiCreateUpdate_id ? "" : `
            if (req.body._id) {
                delete req.body._id;
            };`
    );

    return utils.template.format(template);
}