import { Router } from 'express';
import { getNotifications, markAsRead, markAllRead } from '../controllers/notificationController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authMiddleware, getNotifications);
router.patch('/:id/read', authMiddleware, markAsRead);
router.patch('/read-all', authMiddleware, markAllRead);

export default router;
