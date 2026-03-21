import { Router } from 'express';
import {
  getProviderProfile, updateProviderProfile,
  addService, updateService, deleteService,
  addTimeSlot, addBulkTimeSlots, getTimeSlots, deleteTimeSlot,
  getDashboardStats,
} from '../controllers/providerController';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';

const router = Router();

// Public
router.get('/:id', getProviderProfile);
router.get('/:providerId/slots', getTimeSlots);

// Provider-only (requires auth + PROVIDER role)
router.put('/profile', authMiddleware, requireRole('PROVIDER'), updateProviderProfile);
router.get('/dashboard/stats', authMiddleware, requireRole('PROVIDER'), getDashboardStats);

// Services CRUD
router.post('/services', authMiddleware, requireRole('PROVIDER'), addService);
router.put('/services/:id', authMiddleware, requireRole('PROVIDER'), updateService);
router.delete('/services/:id', authMiddleware, requireRole('PROVIDER'), deleteService);

// Time slots
router.post('/slots', authMiddleware, requireRole('PROVIDER'), addTimeSlot);
router.post('/slots/bulk', authMiddleware, requireRole('PROVIDER'), addBulkTimeSlots);
router.delete('/slots/:id', authMiddleware, requireRole('PROVIDER'), deleteTimeSlot);

export default router;
