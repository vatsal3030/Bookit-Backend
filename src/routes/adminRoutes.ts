import { Router } from 'express';
import { getAllUsers, getAllProviders, verifyProvider, getDashboardStats, getAllAppointments } from '../controllers/adminController';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';

const router = Router();

// All admin routes require ADMIN role
router.use(authMiddleware, requireRole('ADMIN'));

router.get('/stats', getDashboardStats);
router.get('/users', getAllUsers);
router.get('/providers', getAllProviders);
router.patch('/providers/:id/verify', verifyProvider);
router.get('/appointments', getAllAppointments);

export default router;
