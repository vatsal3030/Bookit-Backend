import { Router } from 'express';
import { createOrder, verifyPayment, getPaymentByAppointment, getMyPayments } from '../controllers/paymentController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

router.get('/my-payments', authMiddleware, getMyPayments);
router.post('/create-order', authMiddleware, createOrder);
router.post('/verify', authMiddleware, verifyPayment);
router.get('/:appointmentId', authMiddleware, getPaymentByAppointment);

export default router;
