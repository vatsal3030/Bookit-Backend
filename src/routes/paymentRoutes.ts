import { Router } from 'express';
import { processPayment, getPaymentByAppointment, getMyPayments } from '../controllers/paymentController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

router.get('/my-payments', authMiddleware, getMyPayments);
router.post('/process', authMiddleware, processPayment);
router.get('/:appointmentId', authMiddleware, getPaymentByAppointment);

export default router;
