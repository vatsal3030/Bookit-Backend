import { Router } from 'express';
import { getAppointments, bookAppointment, updateStatus, getAppointmentById, getCustomerAnalytics, rescheduleAppointment, cancelAppointment } from '../controllers/appointmentController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authMiddleware, getAppointments);
router.get('/analytics/customer', authMiddleware, getCustomerAnalytics);
router.get('/:id', authMiddleware, getAppointmentById);
router.post('/', authMiddleware, bookAppointment);
router.patch('/:id/status', authMiddleware, updateStatus);
router.patch('/:id/reschedule', authMiddleware, rescheduleAppointment);
router.patch('/:id/cancel', authMiddleware, cancelAppointment);

export default router;
