
export function controllerTemplate(interfacePath:string, interfaceName:string, documentName:string, mongooseSchema:string, headerComment?:string, template?:string) {
    if(!headerComment){
        headerComment = "";
    };

    if(!template){
        template = `import { Router, Request, Response } from 'express';
import { check, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { {{documentName}}Model } from '../models/{{documentName}}Model';

class {{documentName}}Controller {
    public router: Router;

    constructor() {
        this.router = Router();
        this.routes();
    }

    public routes() {
        this.router.get('/:id', [
            {{getValidators}}
        ], this.get{{documentName}}.bind(this));

        this.router.post('/', [
            {{postValidators}}
        ], this.post{{documentName}}.bind(this));

        this.router.put('/:id', [
            {{putValidators}}
        ], this.put{{documentName}}.bind(this));

        this.router.patch('/:id', [
            {{patchValidators}}
        ], this.patch{{documentName}}.bind(this));

        this.router.delete('/:id', [
            {{deleteValidators}}
        ], this.delete{{documentName}}.bind(this));
    }

    public async get{{documentName}}(req: Request, res: Response): Promise<Response> {
        try {
            await check('id').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Invalid user id').run(req);

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const user = await {{documentName}}Model.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ error: '{{documentName}} not found' });
            }
            return res.json(user);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async post{{documentName}}(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const user = new {{documentName}}Model(req.body);
            await user.save();
            return res.status(201).json(user);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async put{{documentName}}(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const user = await {{documentName}}Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!user) {
                return res.status(404).json({ error: '{{documentName}} not found' });
            }
            return res.json(user);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async patch{{documentName}}(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const user = await {{documentName}}Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!user) {
                return res.status(404).json({ error: '{{documentName}} not found' });
            }
            return res.json(user);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async delete{{documentName}}(req: Request, res: Response): Promise<Response> {
        try {
            const user = await {{documentName}}Model.findByIdAndRemove(req.params.id);
            if (!user) {
                return res.status(404).json({ error: '{{documentName}} not found' });
            }
            return res.status(204).json();
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }
}

export default new {{documentName}}Controller().router;`;
};

    template = template.replace(/{{headerComment}}/g, headerComment);
    template = template.replace(/{{interfaceName}}/g, interfaceName);

    return template;
};