import * as types from '../types/types';

export default function controllerTemplate(templateOptions: {
    headerComment?:string, 
    template?:string, 
    endpoint: string,
    modelPath: string,
    interfaceName: string,
    validator: {[key:string]:{[key:string]:string[]}},
    options?: types.compilerOptions,
}) : string {
    if(!templateOptions.headerComment){
        templateOptions.headerComment = templateOptions.options?.headerComment || "// generated files by very-express";
    };

    let template :string = templateOptions.template || `{{headerComment}}
import { Router, Request, Response } from 'express';
import { check, body, validationResult } from 'express-validator';
import { check, body, validationResult } from 'express-validator';

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

        {{getOneRoute}}

        {{postRoute}}

        {{putRoute}}

        {{patchRoute}}

        {{deleteRoute}}

    };

    public async get{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        try {
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            };

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const result = await {{interfaceName}}Model.findById(req.params.id);
            if (!result) {
                return res.status(404).json({ error: '{{interfaceName}} not found' });
            }
            return res.json(result);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async getList{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        };

        try {
            // Get the filter query
            const searchFilter = new MongoQS().parse(req.query);

            // Get the selected fields from query string
            const selectedFields = await parseFieldsSelect(req.query.select);

            const result = await UserModel.find(searchFilter, selectedFields);
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

    public async create{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        };

        try {
            const result = new {{interfaceName}}Model (req.body);
            await result.save();
            return res.status(201).json(result);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        };
    };

    public async update{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const result = await {{interfaceName}}Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!result) {
                return res.status(404).json({ error: '{{interfaceName}} not found' });
            }
            return res.json(result);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async delete{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        try {
            const result = await {{interfaceName}}Model.findByIdAndDelete(req.params.id);
            if (!result) {
                return res.status(404).json({ error: '{{interfaceName}} not found' });
            }
            return res.status(204).json();
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }
}

export default new {{interfaceName}}Controller().router;
`;
    const indent2 = '\n        ';
    const indent3 = '\n            ';
    const indent4 = '\n                ';
      
    template = template.replace(
        /{{headerComment}}/g, 
        templateOptions.headerComment
    );
    template = template.replace(
        /{{interfaceName}}/g, 
        templateOptions.interfaceName
    );
    template = template.replace(
        /{{modelPath}}/g, 
        templateOptions.modelPath
    );
          
    template = template.replace(
        /{{getListRoute}}/g, 
        !templateOptions.validator[templateOptions.endpoint].get ? 
            '' : 
            `this.router.get('/', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint].get.join(',' + indent4) + indent3}],${indent3}this.getList${templateOptions.interfaceName}.bind(this)${indent2});`
    );

    template = template.replace(
        /{{getOneRoute}}/g, 
        !templateOptions.validator[templateOptions.endpoint+'/{id}'].get ? 
            '' : 
            `this.router.get('/:id', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint+'/{id}'].get.join(',' + indent4) + indent3}],${indent3}this.get${templateOptions.interfaceName}.bind(this)${indent2});`
    );

    template = template.replace(
        /{{postRoute}}/g, 
        !templateOptions.validator[templateOptions.endpoint].post ? 
            '' : 
            `this.router.post('/', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint].post.join(',' + indent4) + indent3}],${indent3}this.create${templateOptions.interfaceName}.bind(this)${indent2});`
    );

    template = template.replace(
        /{{putRoute}}/g, 
        !templateOptions.validator[templateOptions.endpoint+'/{id}'].put ? 
            '' : 
            `this.router.put('/:id', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint+'/{id}'].put.join(',' + indent4) + indent3}],${indent3}this.update${templateOptions.interfaceName}.bind(this)${indent2});`
    );
    template = template.replace(
        /{{patchRoute}}/g, 
        !templateOptions.validator[templateOptions.endpoint+'/{id}'].patch ? 
            '' : 
            `this.router.patch('/:id', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint+'/{id}'].patch.join(',' + indent4) + indent3}],${indent3}this.update${templateOptions.interfaceName}.bind(this)${indent2});`
    );

    template = template.replace(
        /{{deleteRoute}}/g, 
        !templateOptions.validator[templateOptions.endpoint+'/{id}'].delete ? 
            '' : 
            `this.router.delete('/:id', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint+'/{id}'].delete.join(',' + indent4) + indent3}],${indent3}this.delete${templateOptions.interfaceName}.bind(this)${indent2});`
    );

    return template;
};