import { Router } from 'express';
import { getNotifications, markAsRead, markAllAsRead, clearAll } from '../controllers/notificationController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.get('/', getNotifications);
router.delete('/clear-all', clearAll);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);

export default router;
