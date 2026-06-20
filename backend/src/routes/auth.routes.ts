import { Router } from 'express';
import { register, login, me, logout } from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', authMiddleware, me);
router.post('/logout', authMiddleware, logout);

export default router;
