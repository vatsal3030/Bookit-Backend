import { Router } from 'express';
import { getAppointments, bookAppointment, updateStatus, getAppointmentById } from '../controllers/appointmentController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authMiddleware, getAppointments);
router.get('/:id', authMiddleware, getAppointmentById);
router.post('/', authMiddleware, bookAppointment);
router.patch('/:id/status', authMiddleware, updateStatus);

export default router;
