import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/authMiddleware';
import { asyncHandler, AppError } from '../utils/errorHandler';
import crypto from 'crypto';
import Razorpay from 'razorpay';
// ─── INIT RAZORPAY ───────────────────────────────────────

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

// ─── SCHEMAS ─────────────────────────────────────────────

const createOrderSchema = z.object({
  appointmentId: z.string(),
});

const verifyPaymentSchema = z.object({
  razorpay_payment_id: z.string(),
  razorpay_order_id: z.string(),
  razorpay_signature: z.string(),
  appointmentId: z.string(),
});

// ─── CREATE RAZORPAY ORDER ───────────────────────────────

export const createOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { appointmentId } = createOrderSchema.parse(req.body);

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { payment: true, service: true },
  });

  if (!appt) throw new AppError('Appointment not found', 404);
  if (appt.customerId !== req.user.id) throw new AppError('Forbidden', 403);
  if (appt.payment) throw new AppError('Payment already processed', 400);

  const platformFee = Math.ceil(appt.totalAmount * 0.02);
  const finalAmount = appt.totalAmount + platformFee;

  const options = {
    amount: finalAmount * 100, // Razorpay expects amount in paise
    currency: 'INR',
    receipt: `INV-${Date.now()}`,
  };

  const order = await razorpay.orders.create(options);

  res.json({
    success: true,
    orderId: order.id,
    amount: finalAmount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
  });
});

// ─── VERIFY PAYMENT ──────────────────────────────────────

export const verifyPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, appointmentId } = verifyPaymentSchema.parse(req.body);

  const secret = process.env.RAZORPAY_KEY_SECRET || '';

  const generatedSignature = crypto
    .createHmac('sha256', secret)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (generatedSignature !== razorpay_signature) {
    throw new AppError('Payment verification failed', 400);
  }

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true, provider: { include: { user: { select: { name: true } } } } },
  });

  if (!appt) throw new AppError('Appointment not found', 404);

  // Fetch payment details to know method
  const rpPayment = await razorpay.payments.fetch(razorpay_payment_id);
  let dbMethod = 'CARD';
  if (rpPayment.method === 'upi') dbMethod = 'UPI';
  else if (rpPayment.method === 'wallet') dbMethod = 'WALLET';

  const platformFee = Math.ceil(appt.totalAmount * 0.02);
  const finalAmount = appt.totalAmount + platformFee;

  const payment = await prisma.payment.create({
    data: {
      appointmentId,
      amount: finalAmount,
      method: dbMethod as any,
      status: 'SUCCESS',
      transactionNo: razorpay_payment_id,
      invoiceNo: `INV-${Date.now()}`,
      paidAt: new Date(),
    },
  });

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'CONFIRMED' },
  });

  await prisma.notification.create({
    data: {
      userId: req.user.id,
      title: 'Payment Successful! ✅',
      message: `₹${finalAmount} paid for ${appt.service.name} (incl. 2% fee). Invoice: ${payment.invoiceNo}`,
      type: 'PAYMENT',
      link: `/dashboard`,
    },
  });

  await prisma.notification.create({
    data: {
      userId: appt.provider.userId,
      title: 'Payment Received! 💰',
      message: `₹${finalAmount} received for ${appt.service.name}.`,
      type: 'PAYMENT',
      link: '/dashboard',
    },
  });

  res.json({
    success: true,
    payment,
    appointment: { id: appt.id, status: 'CONFIRMED' },
  });
});

// ─── GET PAYMENT DETAILS ─────────────────────────────────

export const getPaymentByAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const appointmentId = req.params.appointmentId as string;

  const payment = await prisma.payment.findUnique({
    where: { appointmentId },
    include: {
      appointment: {
        include: {
          service: true,
          provider: { include: { user: { select: { name: true } } } },
          timeSlot: true,
        },
      },
    },
  });

  if (!payment) throw new AppError('Payment not found', 404);
  res.json({ success: true, payment });
});

// ─── GET MY PAYMENTS ─────────────────────────────────────

export const getMyPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const isCustomer = req.user.role === 'CUSTOMER';

  const payments = await prisma.payment.findMany({
    where: isCustomer 
      ? { appointment: { customerId: req.user.id } }
      : { appointment: { provider: { userId: req.user.id } } },
    include: {
      appointment: {
        include: {
          service: { select: { name: true } },
          customer: { select: { name: true, email: true } },
          provider: { include: { user: { select: { name: true } } } },
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ success: true, payments });
});
