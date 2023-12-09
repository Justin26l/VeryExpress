import { Router, Request, Response } from 'express';
import { check, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { UserModel } from '../models/UserModel';

class UserController {
    public router: Router;

    constructor() {
        this.router = Router();
        this.routes();
    }

    public routes() {
        this.router.post('/', [
            check('name').isString(),
            // Add more validators as needed
        ], this.createUser.bind(this));

        this.router.get('/:id', this.getUser.bind(this));

        this.router.put('/:id', [
            check('name').optional().isString(),
            // Add more validators as needed
        ], this.updateUser.bind(this));

        this.router.delete('/:id', this.deleteUser.bind(this));
    }

    public async createUser(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const user = new UserModel (req.body);
            await user.save();
            return res.status(201).json(user);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async getUser(req: Request, res: Response): Promise<Response> {
        try {
            await check('id').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Invalid user id').run(req);

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const user = await UserModel.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.json(user);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async updateUser(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const user = await UserModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.json(user);
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }

    public async deleteUser(req: Request, res: Response): Promise<Response> {
        try {
            const user = await UserModel.findByIdAndRemove(req.params.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.status(204).json();
        } catch (err:any) {
            return res.status(500).json({ error: err.message });
        }
    }
}

export default new UserController().router;