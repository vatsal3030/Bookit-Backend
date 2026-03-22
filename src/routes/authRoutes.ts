import { Router } from 'express';
import { register, login, googleAuth, getProfile, updateProfile, switchRole } from '../controllers/authController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { authLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleAuth);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.post('/switch-role', authMiddleware, switchRole);

export default router;
