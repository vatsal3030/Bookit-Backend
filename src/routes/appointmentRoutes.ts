import { Router } from 'express';
import { getAppointments, bookAppointment, updateStatus, getAppointmentById, getCustomerAnalytics, rescheduleAppointment, cancelAppointment, completeAppointment } from '../controllers/appointmentController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authMiddleware, getAppointments);
router.get('/analytics/customer', authMiddleware, getCustomerAnalytics);
router.get('/:id', authMiddleware, getAppointmentById);
router.post('/', authMiddleware, bookAppointment);
router.patch('/:id/status', authMiddleware, updateStatus);
router.patch('/:id/reschedule', authMiddleware, rescheduleAppointment);
router.patch('/:id/cancel', authMiddleware, cancelAppointment);
router.patch('/:id/complete', authMiddleware, completeAppointment);

export default router;
