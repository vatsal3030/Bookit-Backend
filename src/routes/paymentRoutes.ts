import { Router } from 'express';
import { processPayment, getPaymentByAppointment } from '../controllers/paymentController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

router.post('/process', authMiddleware, processPayment);
router.get('/:appointmentId', authMiddleware, getPaymentByAppointment);

export default router;
