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
import mongoose from 'mongoose';
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
            await check('id').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Invalid user id').run(req);

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const user = await {{interfaceName}}Model.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ error: '{{interfaceName}} not found' });
            }
            return res.json(user);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async getList{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        try {
            const user = await {{interfaceName}}Model.find();
            if (!user) {
                return res.status(404).json({ error: 'No {{interfaceName}} found' });
            }
            return res.json(user);
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
            const user = new {{interfaceName}}Model (req.body);
            await user.save();
            return res.status(201).json(user);
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
            const user = await {{interfaceName}}Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!user) {
                return res.status(404).json({ error: '{{interfaceName}} not found' });
            }
            return res.json(user);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async delete{{interfaceName}}(req: Request, res: Response): Promise<Response> {
        try {
            const user = await {{interfaceName}}Model.findByIdAndDelete(req.params.id);
            if (!user) {
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
      
    template = template.replace(/{{headerComment}}/g, templateOptions.headerComment);
    template = template.replace(/{{interfaceName}}/g, templateOptions.interfaceName);
    template = template.replace(/{{modelPath}}/g, templateOptions.modelPath);
          
    if (templateOptions.validator[templateOptions.endpoint].get){
        template = template.replace(/{{getListRoute}}/g,`this.router.get('/', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint].get.join(',' + indent4) + indent3}],${indent3}this.getList${templateOptions.interfaceName}.bind(this)${indent2});`);
    };
    if (templateOptions.validator[templateOptions.endpoint+'/{id}'].get){
        template = template.replace(/{{getOneRoute}}/g,`this.router.get('/:id', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint+'/{id}'].get.join(',' + indent4) + indent3}],${indent3}this.get${templateOptions.interfaceName}.bind(this)${indent2});`);
    };

    if (templateOptions.validator[templateOptions.endpoint].post){
        template = template.replace(/{{postRoute}}/g,`this.router.post('/', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint].post.join(',' + indent4) + indent3}],${indent3}this.create${templateOptions.interfaceName}.bind(this)${indent2});`);
    };

    if (templateOptions.validator[templateOptions.endpoint+'/{id}'].put){
        template = template.replace(/{{putRoute}}/g,`this.router.put('/:id', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint+'/{id}'].put.join(',' + indent4) + indent3}],${indent3}this.update${templateOptions.interfaceName}.bind(this)${indent2});`);
    };
    if (templateOptions.validator[templateOptions.endpoint+'/{id}'].patch){
        template = template.replace(/{{patchRoute}}/g,`this.router.patch('/:id', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint+'/{id}'].patch.join(',' + indent4) + indent3}],${indent3}this.update${templateOptions.interfaceName}.bind(this)${indent2});`);
    };

    if (templateOptions.validator[templateOptions.endpoint+'/{id}'].delete){
        template = template.replace(/{{deleteRoute}}/g,`this.router.delete('/:id', ${indent3}[${indent4 + templateOptions.validator[templateOptions.endpoint+'/{id}'].delete.join(',' + indent4) + indent3}],${indent3}this.delete${templateOptions.interfaceName}.bind(this)${indent2});`);
    };

    return template;
};