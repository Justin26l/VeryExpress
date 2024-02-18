import util from "util";
import * as types from "../types/types";
import { Schema } from "express-validator";

export default function controllerTemplate(templateOptions: {
    template?:string, 
    endpoint: string,
    modelPath: string,
    interfaceName: string,
    validators: {[key:string]:{[key:string]:Schema}},
    compilerOptions: types.compilerOptions,
}) : string {

    let template :string = templateOptions.template || `{{headerComment}}
import { Router, Request, Response } from 'express';
import { checkSchema, validationResult } from 'express-validator';
import { parseFieldsSelect } from '../utils/common.gen';
import MongoQS from 'mongo-ts-querystring';

import { {{interfaceName}}Model } from '{{modelPath}}';

class {{interfaceName}}Controller {
    public router: Router;

    constructor() {
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

    public async get{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return res.status(400).json(validationError.array());
            };

            const result = await {{interfaceName}}Model.findById(req.params.id);
            if (!result) {
                return res.status(404).json({ error: "no data found" });
            }
            else {
                return res.status(200).json(result);
            };
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async getList{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return res.status(400).json(validationError.array());
            };
            
            const searchFilter = new MongoQS().parse(req.query);
            let selectedFields : {[key: string]: number} | undefined = undefined;

            try { selectedFields = parseFieldsSelect(req.query.select || '');} 
            catch (err:any) { return res.status(400).json({ error: err.message });};

            const result = await {{interfaceName}}Model.find(searchFilter, selectedFields);
            return res.status(200).json(result);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async create{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return res.status(400).json(validationError.array());
            };{{check_id}}
            
            const result = await {{interfaceName}}Model.create(req.body);
            if (!result) {
                return res.status(500).json({ error: 'failed to create data' });
            }
            else {
                return res.status(201).json(result);
            };
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        };
    };

    public async update{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return res.status(400).json(validationError.array());
            };{{check_id}}

            const result = await {{interfaceName}}Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!result) {
                return res.status(404).json({ error: "failed to update" });
            }
            else {
                return res.status(200).json(result);
            };
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async replace{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return res.status(400).json(validationError.array());
            };{{check_id}}

            const result = await {{interfaceName}}Model.replaceOne({_id: req.params.id}, req.body);
            if (!result) {
                return res.status(404).json({ error: "failed to update" });
            }
            else {
                return res.status(200).json(result);
            };
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async delete{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        try {
            const validationError = validationResult(req);
            if ( ! validationError.isEmpty() ) {
                return res.status(400).json(validationError.array());
            };

            const result = await {{interfaceName}}Model.findByIdAndDelete(req.params.id);
            if (!result) {
                return res.status(404).json({ error: "failed to update" });
            }
            else {
                return res.status(204).json(result);
            };
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }
}

export default new {{interfaceName}}Controller().router;
`;
      
    const indent3 = "           ";

    template = template.replace(/{{headerComment}}/g, templateOptions.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{interfaceName}}/g, templateOptions.interfaceName);
    template = template.replace(/{{modelPath}}/g, templateOptions.modelPath);

    template = template.replace(
        /{{getListRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint].get ? `
        // getListRoute disabled` : `
        this.router.get('/', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint].get, { depth: null }).replace(/^/gm, indent3) }),
            this.getList${templateOptions.interfaceName}.bind(this)
        );`
    );

    template = template.replace(
        /{{getRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"].get ? `
        // getRoute disabled` : `
        this.router.get('/:id', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].get, { depth: null }).replace(/^/gm, indent3) }),
            this.get${templateOptions.interfaceName}.bind(this)
        );`
    );

    template = template.replace(
        /{{postRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint].post ? `
        // postRoute disabled` : `
        this.router.post('/', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint].post, { depth: null }).replace(/^/gm, indent3) }),
            this.create${templateOptions.interfaceName}.bind(this)
        );`
    );

    template = template.replace(
        /{{putRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"].put ? `
        // putRoute disabled` : `
        this.router.put('/:id', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].put, { depth: null }).replace(/^/gm, indent3) }),
            this.replace${templateOptions.interfaceName}.bind(this)
        );`
    );
    template = template.replace(
        /{{patchRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"].patch ? `
        // patchRoute disabled` : `
        this.router.patch('/:id', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].patch, { depth: null }).replace(/^/gm, indent3) }),
            this.update${templateOptions.interfaceName}.bind(this)
        );`
    );

    template = template.replace(
        /{{deleteRoute}}/g, 
        !templateOptions.validators[templateOptions.endpoint+"/{id}"].delete ? `
        // deleteRoute disabled` : `
        this.router.delete('/:id', 
            checkSchema(${ util.inspect(templateOptions.validators[templateOptions.endpoint+"/{id}"].delete, { depth: null }).replace(/^/gm, indent3) }),
            this.delete${templateOptions.interfaceName}.bind(this)
        );`
    );

    template = template.replace(
        /{{check_id}}/g, 
        templateOptions.compilerOptions.allowApiCreateUpdate_id ? "" : `
            if (req.body._id) {
                delete req.body._id;
            };`
    );

    return template;
}