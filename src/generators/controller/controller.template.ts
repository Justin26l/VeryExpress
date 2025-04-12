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
import vex from "./../../system/_utils/index.gen";
import MongoQS from 'mongo-ts-querystring';

import { {{documentName}}Model } from '{{modelPath}}';

class {{documentName}}Controller extends controllerFactory._ControllerFactory {
    public router: Router;

    constructor() {
        super();
        this.router = Router();
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
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return vex.response.send(res, 400, {
                    code: vex.response.code.err_validation, 
                    result: validationError.array()
                });
            };

            const result = await {{documentName}}Model.findById(req.params.id){{populateAll}};

            if (!result) {
                return vex.response.send(res, 404);
            }
            else {
                return vex.response.send(res, 200, { result });
            };
        } catch (err:any) {
            return vex.response.send(res, 500, { message: err.message });
        }
    }

    public async getList{{documentName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return vex.response.send(res, 400, {
                    code: vex.response.code.err_validation, 
                    result: validationError.array()
                });
            };
            
            const searchFilter = new MongoQS().parse(req.query);
            delete searchFilter._select;
            delete searchFilter._join;
            
            let selectedFields : {[key: string]: number} | undefined = undefined;
            let populateOptions : any | undefined = undefined;

            try { 
                selectedFields = vex.common.parseFieldsSelect(req);
                populateOptions = vex.common.parseCollectionJoin(req, {{populateOptions}});
            } 
            catch (err:any) { 
                return vex.response.send(res, 400, {
                    code: vex.response.code.err_validation, 
                    result: err.message
                });
            };

            const result = await {{documentName}}Model.find(searchFilter, selectedFields).populate(populateOptions);
            return vex.response.send(res, 200, { result });
        } catch (err:any) {
            return vex.response.send(res, 500, { result: err.message });
        }
    }

    public async create{{documentName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return vex.response.send(res, 400, {
                    code: vex.response.code.err_validation, 
                    result: validationError.array()
                });
            };{{check_id}}
            
            const result = await {{documentName}}Model.create(req.body);
            if (!result) {
                return vex.response.send(res, 400, {
                    code: vex.response.code.err_create
                });
            }
            else {
                return vex.response.send(res, 201, {result});
            };
        } catch (err:any) {
            return vex.response.send(res, 500, { message: err.message });
        };
    };

    public async update{{documentName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return vex.response.send(res, 400, {
                    code: vex.response.code.err_validation, 
                    result: validationError.array()
                });
            };{{check_id}}

            const result = await {{documentName}}Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!result) {
                return vex.response.send(res, 404, {
                    code: vex.response.code.err_update
                });
            }
            else {
                return vex.response.send(res, 200, { result });
            };
        } catch (err:any) {
            return vex.response.send(res, 500, { message: err.message });
        }
    }

    public async replace{{documentName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return vex.response.send(res, 400, {
                    code: vex.response.code.err_validation, 
                    result: validationError.array()
                });
            };{{check_id}}

            const result = await {{documentName}}Model.replaceOne({_id: req.params.id}, req.body);
            if (!result) {
                return vex.response.send(res, 404, { 
                    code: vex.response.code.err_update
                });
            }
            else {
                return vex.response.send(res, 200, { result });
            };
        } catch (err:any) {
            return vex.response.send(res, 500, { message: err.message });
        }
    }

    public async delete{{documentName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return vex.response.send(res, 400, {
                    code: vex.response.code.err_validation, 
                    result: validationError.array()
                });
            };

            const result = await {{documentName}}Model.findByIdAndDelete(req.params.id);
            if (!result) {
                return vex.response.send(res, 404, {
                    code: vex.response.code.err_delete
                });
            }
            else {
                return vex.response.send(res, 204, { result });
            };
        } catch (err:any) {
            return vex.response.send(res, 500, { message: err.message });
        }
    }
}

export default new {{documentName}}Controller().router;
`;
    
    const indent = "    ";
    const indent2 = indent+indent;
    const indent3 = indent2+indent;
    const indent4 = indent3+indent;

    template = template.replace(/{{headerComment}}/g, templateOptions.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{documentName}}/g, templateOptions.documentName);
    template = template.replace(/{{modelPath}}/g, templateOptions.modelPath);

    template = template.replace(
        /{{getListRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint].get ? `
        // getListRoute disabled` : `
        this.router.get('/', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint].get, { depth: null }).replace(/^/gm, indent3) }),
            this.getList${templateOptions.documentName}.bind(this)
        );`
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
        !templateOptions.validators[templateOptions.endpoint+"/{id}"].get ? `
        // getRoute disabled` : `
        this.router.get('/:id', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].get, { depth: null }).replace(/^/gm, indent3) }),
            this.get${templateOptions.documentName}.bind(this)
        );`
    );

    template = template.replace(
        /{{postRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint].post ? `
        // postRoute disabled` : `
        this.router.post('/', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint].post, { depth: null }).replace(/^/gm, indent3) }),
            this.create${templateOptions.documentName}.bind(this)
        );`
    );

    template = template.replace(
        /{{putRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"].put ? `
        // putRoute disabled` : `
        this.router.put('/:id', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].put, { depth: null }).replace(/^/gm, indent3) }),
            this.replace${templateOptions.documentName}.bind(this)
        );`
    );
    template = template.replace(
        /{{patchRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"].patch ? `
        // patchRoute disabled` : `
        this.router.patch('/:id', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].patch, { depth: null }).replace(/^/gm, indent3) }),
            this.update${templateOptions.documentName}.bind(this)
        );`
    );

    template = template.replace(
        /{{deleteRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"].delete ? `
        // deleteRoute disabled` : `
        this.router.delete('/:id', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].delete, { depth: null }).replace(/^/gm, indent3) }),
            this.delete${templateOptions.documentName}.bind(this)
        );`
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