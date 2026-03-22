import { Router } from 'express';
import {
  getProviderProfile, updateProviderProfile,
  addService, updateService, deleteService, addServiceAddOn, updateServiceAddOn, deleteServiceAddOn,
  addTimeSlot, addBulkTimeSlots, getTimeSlots, deleteTimeSlot,
  getDashboardStats, getProviderAnalytics,
  createPromoCode, deletePromoCode,
  addStaff, updateStaff, deleteStaff
} from '../controllers/providerController';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';

const router = Router();

// Public
router.get('/:id', getProviderProfile);
router.get('/:providerId/slots', getTimeSlots);

// Provider-only (requires auth + PROVIDER role)
router.put('/profile', authMiddleware, requireRole('PROVIDER'), updateProviderProfile);
router.get('/dashboard/stats', authMiddleware, requireRole('PROVIDER'), getDashboardStats);
router.get('/dashboard/analytics', authMiddleware, requireRole('PROVIDER'), getProviderAnalytics);

// Services CRUD
router.post('/services', authMiddleware, requireRole('PROVIDER'), addService);
router.put('/services/:id', authMiddleware, requireRole('PROVIDER'), updateService);
router.delete('/services/:id', authMiddleware, requireRole('PROVIDER'), deleteService);

// Service Add-Ons CRUD
router.post('/services/:serviceId/addons', authMiddleware, requireRole('PROVIDER'), addServiceAddOn);
router.put('/addons/:id', authMiddleware, requireRole('PROVIDER'), updateServiceAddOn);
router.delete('/addons/:id', authMiddleware, requireRole('PROVIDER'), deleteServiceAddOn);

// Promo Codes
router.post('/promocodes', authMiddleware, requireRole('PROVIDER'), createPromoCode);
router.delete('/promocodes/:id', authMiddleware, requireRole('PROVIDER'), deletePromoCode);

// Staff / Team Members
router.post('/staff', authMiddleware, requireRole('ORGANIZATION'), addStaff);
router.put('/staff/:id', authMiddleware, requireRole('ORGANIZATION'), updateStaff);
router.delete('/staff/:id', authMiddleware, requireRole('ORGANIZATION'), deleteStaff);

// Time slots
router.post('/slots', authMiddleware, requireRole('PROVIDER'), addTimeSlot);
router.post('/slots/bulk', authMiddleware, requireRole('PROVIDER'), addBulkTimeSlots);
router.delete('/slots/:id', authMiddleware, requireRole('PROVIDER'), deleteTimeSlot);

export default router;
