import * as types from '../types/types';

export default function controllerTemplate(templateOptions: {
    headerComment?:string, 
    template?:string, 
    path: string,
    modelPath: string,
    interfaceName: string,
    validator: {[key:string]:{[key:string]:string[]}},
    options: types.compilerOptions,
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
        this.router.get(
            '/', 
            [
                {{getListValidator}}
            ], 
            this.get{{interfaceName}}List.bind(this)
    );

        this.router.get(
            '/:id', 
            [
                {{getOneValidator}}
            ], 
            this.get{{interfaceName}}.bind(this)
        );

        this.router.post(
            '/', 
            [
                {{postValidator}}
            ], 
            this.create{{interfaceName}}.bind(this)
        );

        this.router.put(
            '/:id', 
            [
                {{putValidator}}
            ], 
            this.update{{interfaceName}}.bind(this)
        );
        this.router.patch(
            '/:id', 
            [
                {{patchValidator}}
            ], 
            this.update{{interfaceName}}.bind(this)
        );

        this.router.delete(
            '/:id', 
            [
                {{deleteValidator}}
            ], 
            this.delete{{interfaceName}}.bind(this)
        );
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

    public async get{{interfaceName}}List(req: Request, res: Response): Promise<Response> {
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
    template = template.replace(/{{headerComment}}/g, templateOptions.headerComment);
    template = template.replace(/{{interfaceName}}/g, templateOptions.interfaceName);
    template = template.replace(/{{modelPath}}/g, templateOptions.modelPath);
    template = template.replace(/{{getListValidator}}/g, templateOptions.validator[templateOptions.path].get.join(',\n                '));
    template = template.replace(/{{getOneValidator}}/g, templateOptions.validator[templateOptions.path+'/{id}'].get.join(',\n                '));
    template = template.replace(/{{postValidator}}/g, templateOptions.validator[templateOptions.path].post.join(',\n                '));
    template = template.replace(/{{putValidator}}/g, templateOptions.validator[templateOptions.path+'/{id}'].put.join(',\n                '));
    template = template.replace(/{{patchValidator}}/g, templateOptions.validator[templateOptions.path+'/{id}'].patch.join(',\n                '));
    template = template.replace(/{{deleteValidator}}/g, templateOptions.validator[templateOptions.path+'/{id}'].delete.join(',\n                '));

    return template;
};