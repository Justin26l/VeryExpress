import { Router } from 'express';
import userRoutes from './controllers/UserController';

const router :Router = Router();

router.use('/users', userRoutes);

export default router;