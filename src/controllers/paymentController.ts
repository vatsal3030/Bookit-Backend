import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/authMiddleware';
import { asyncHandler, AppError } from '../utils/errorHandler';

// ─── SCHEMAS ─────────────────────────────────────────────

const paymentSchema = z.object({
  appointmentId: z.string(),
  method: z.enum(['CARD', 'UPI', 'WALLET', 'PAYLATER']),
});

// ─── PROCESS PAYMENT ─────────────────────────────────────

export const processPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { appointmentId, method } = paymentSchema.parse(req.body);

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { payment: true, service: true, provider: { include: { user: { select: { name: true } } } } },
  });

  if (!appt) throw new AppError('Appointment not found', 404);
  if (appt.customerId !== req.user.id) throw new AppError('Forbidden', 403);
  if (appt.payment) throw new AppError('Payment already processed', 400);

  // Simulate payment gateway processing (90% success rate)
  const isSuccess = Math.random() > 0.1;

  if (!isSuccess && method !== 'PAYLATER') {
    throw new AppError('Payment failed. Gateway rejected the transaction.', 402);
  }

  const paymentStatus = method === 'PAYLATER' ? 'PENDING' : 'SUCCESS';

  const payment = await prisma.payment.create({
    data: {
      appointmentId,
      amount: appt.amount,
      method: method as any,
      status: paymentStatus as any,
      transactionNo: `TXN-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      invoiceNo: `INV-${Date.now()}`,
      ...(paymentStatus === 'SUCCESS' && { paidAt: new Date() }),
    },
  });

  // Update appointment status if payment succeeded
  if (paymentStatus === 'SUCCESS') {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CONFIRMED' },
    });
  }

  // Notify customer
  await prisma.notification.create({
    data: {
      userId: req.user.id,
      title: paymentStatus === 'SUCCESS' ? 'Payment Successful! ✅' : 'Payment Pending',
      message: paymentStatus === 'SUCCESS'
        ? `₹${appt.amount} paid for ${appt.service.name}. Invoice: ${payment.invoiceNo}`
        : `Your payment of ₹${appt.amount} is pending.`,
      type: 'PAYMENT',
      link: `/dashboard`,
    },
  });

  // Notify provider
  if (paymentStatus === 'SUCCESS') {
    await prisma.notification.create({
      data: {
        userId: appt.provider.userId,
        title: 'Payment Received! 💰',
        message: `₹${appt.amount} received for ${appt.service.name}.`,
        type: 'PAYMENT',
        link: '/dashboard',
      },
    });
  }

  res.json({
    success: true,
    payment,
    appointment: { id: appt.id, status: paymentStatus === 'SUCCESS' ? 'CONFIRMED' : appt.status },
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
