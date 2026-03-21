import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/authMiddleware';
import { asyncHandler, AppError } from '../utils/errorHandler';

// ─── SCHEMAS ─────────────────────────────────────────────

const appointmentSchema = z.object({
  providerId: z.string(),
  serviceId: z.string(),
  timeSlotId: z.string(),
  addOnIds: z.array(z.string()).optional(),
  promoCode: z.string().optional(),
  notes: z.string().optional(),
});

// ─── GET APPOINTMENTS ────────────────────────────────────

export const getAppointments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const isCustomer = req.user.role === 'CUSTOMER';
  const status = req.query.status as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const where: any = isCustomer
    ? { customerId: req.user.id }
    : { provider: { userId: req.user.id } };

  if (status && ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'].includes(status)) {
    where.status = status;
  }

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: {
        provider: {
          include: { user: { select: { name: true, email: true, avatar: true } } },
        },
        customer: { select: { name: true, email: true, contactNo: true, avatar: true } },
        service: true,
        timeSlot: true,
        payment: true,
        review: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.appointment.count({ where }),
  ]);

  res.json({ success: true, appointments, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

// ─── BOOK APPOINTMENT ────────────────────────────────────

export const bookAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { providerId, serviceId, timeSlotId, addOnIds, promoCode, notes } = appointmentSchema.parse(req.body);

  // Prevent self-booking
  const providerProfile = await prisma.serviceProvider.findUnique({ where: { id: providerId } });
  if (providerProfile?.userId === req.user.id) {
    throw new AppError('You cannot book your own services.', 400);
  }

  const slot = await prisma.timeSlot.findUnique({ where: { id: timeSlotId } });
  if (!slot || !slot.isAvailable) throw new AppError('Time slot is not available', 400);

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new AppError('Service not found', 404);

  const amount = service.baseFee + service.tax;
  let totalAmount = amount;
  let addOnsData: any[] = [];
  let appliedPromoDiscount = 0;

  // Add-ons
  if (addOnIds && addOnIds.length > 0) {
    const addOns = await prisma.serviceAddOn.findMany({
      where: { id: { in: addOnIds }, serviceId }
    });
    
    addOns.forEach(addon => {
      totalAmount += addon.price;
      addOnsData.push({ id: addon.id, name: addon.name, price: addon.price });
    });
  }

  // Pre-validate promo code to avoid throwing inside transaction
  let activePromo: any = null;
  if (promoCode) {
    activePromo = await prisma.promoCode.findFirst({
      where: { code: promoCode, providerId, isActive: true }
    });

    if (activePromo) {
      const isValidDate = !activePromo.validUntil || new Date(activePromo.validUntil) > new Date();
      const isWithinUses = !activePromo.maxUses || activePromo.currentUses < activePromo.maxUses;

      if (isValidDate && isWithinUses) {
        appliedPromoDiscount = (totalAmount * activePromo.discountPercent) / 100;
        totalAmount -= appliedPromoDiscount;
      } else {
        throw new AppError('Promo code is expired or invalid', 400);
      }
    } else {
      throw new AppError('Invalid promo code', 400);
    }
  }

  const appointment = await prisma.$transaction(async (tx) => {
    await tx.timeSlot.update({ where: { id: timeSlotId }, data: { isAvailable: false } });

    if (activePromo) {
      await tx.promoCode.update({
        where: { id: activePromo.id },
        data: { currentUses: { increment: 1 } }
      });
    }

    const appt = await tx.appointment.create({
      data: {
        customerId: req.user.id,
        providerId,
        serviceId,
        timeSlotId,
        amount,
        totalAmount,
        discountAmount: appliedPromoDiscount,
        promoCode: activePromo ? activePromo.code : null,
        addOns: addOnsData.length > 0 ? addOnsData : undefined,
        notes,
        confirmationNo: `APT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      },
      include: {
        service: true,
        timeSlot: true,
        provider: { include: { user: { select: { name: true } } } },
      },
    });

    return appt;
  });

  // Notify provider
  const provider = await prisma.serviceProvider.findUnique({ where: { id: providerId } });
  if (provider) {
    await prisma.notification.create({
      data: {
        userId: provider.userId,
        title: 'New Booking!',
        message: `${req.user.name || 'A customer'} booked ${appointment.service.name}`,
        type: 'BOOKING',
        link: '/dashboard',
      },
    });
  }

  // Notify customer
  await prisma.notification.create({
    data: {
      userId: req.user.id,
      title: 'Booking Confirmed',
      message: `Your appointment #${appointment.confirmationNo} has been created. Proceed to payment.`,
      type: 'BOOKING',
      link: `/checkout/${appointment.id}`,
    },
  });

  res.status(201).json({ success: true, appointment });
});

// ─── UPDATE STATUS ───────────────────────────────────────

export const updateStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const status = String(req.body.status);
  const cancellationReason = req.body.reason as string | undefined;

  if (!['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)) {
    throw new AppError('Invalid status', 400);
  }

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { provider: true, service: true },
  });
  if (!appt) throw new AppError('Appointment not found', 404);

  // Release slot if cancelled
  if (status === 'CANCELLED') {
    await prisma.timeSlot.update({ where: { id: appt.timeSlotId }, data: { isAvailable: true } });
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: status as any,
      ...(cancellationReason && { cancellationReason }),
    },
    include: {
      service: true,
      timeSlot: true,
      payment: true,
    },
  });

  // Notify the other party
  const notifyUserId = req.user.id === appt.customerId ? appt.provider.userId : appt.customerId;
  await prisma.notification.create({
    data: {
      userId: notifyUserId,
      title: `Appointment ${status}`,
      message: `Appointment for ${appt.service.name} has been ${status.toLowerCase()}.`,
      type: 'BOOKING',
      link: '/dashboard',
    },
  });

  res.json({ success: true, appointment: updated });
});

// ─── GET SINGLE APPOINTMENT ─────────────────────────────

export const getAppointmentById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      provider: {
        include: { user: { select: { name: true, email: true, avatar: true } } },
      },
      customer: { select: { name: true, email: true, contactNo: true, avatar: true } },
      service: true,
      timeSlot: true,
      payment: true,
      review: true,
    },
  });

  if (!appointment) throw new AppError('Appointment not found', 404);
  if (appointment.customerId !== req.user.id && appointment.provider.userId !== req.user.id) {
    throw new AppError('Unauthorized', 403);
  }

  res.json({ success: true, appointment });
});

// ─── CUSTOMER ANALYTICS ──────────────────────────────────

export const getCustomerAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const customerId = req.user.id;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Overall stats
  const [totalAppointments, spendAggr, completedCount, cancelledCount] = await Promise.all([
    prisma.appointment.count({ where: { customerId } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        appointment: { customerId },
        status: 'SUCCESS',
      },
    }),
    prisma.appointment.count({ where: { customerId, status: 'COMPLETED' } }),
    prisma.appointment.count({ where: { customerId, status: 'CANCELLED' } }),
  ]);

  // Most booked categories
  const appointmentsWithService = await prisma.appointment.findMany({
    where: { customerId },
    include: { service: { select: { category: true } } },
  });

  const categoryMap: Record<string, number> = {};
  appointmentsWithService.forEach(a => {
    const cat = a.service?.category || 'Other';
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
  });
  const categories = Object.entries(categoryMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Daily bookings over last 30 days
  const recentAppointments = await prisma.appointment.findMany({
    where: { customerId, createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true, amount: true },
  });

  const dailyMap: Record<string, { date: string; bookings: number; spent: number }> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const key = d.toISOString().split('T')[0];
    dailyMap[key] = { date: key, bookings: 0, spent: 0 };
  }

  recentAppointments.forEach(a => {
    const key = a.createdAt.toISOString().split('T')[0];
    if (dailyMap[key]) {
      dailyMap[key].bookings += 1;
      dailyMap[key].spent += a.amount;
    }
  });

  res.json({
    success: true,
    analytics: {
      totalAppointments,
      totalSpent: spendAggr._sum.amount || 0,
      completedCount,
      cancelledCount,
      categories,
      dailyData: Object.values(dailyMap),
    },
  });
});

// ─── RESCHEDULE APPOINTMENT ──────────────────────────────

export const rescheduleAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { newTimeSlotId, reason } = req.body;

  if (!newTimeSlotId) throw new AppError('New time slot is required', 400);

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { provider: true, service: true, timeSlot: true },
  });
  if (!appt) throw new AppError('Appointment not found', 404);

  // Only the customer or the provider can reschedule
  if (appt.customerId !== req.user.id && appt.provider.userId !== req.user.id) {
    throw new AppError('Unauthorized', 403);
  }

  if (!appt.rescheduleAllowed) throw new AppError('Rescheduling is not allowed for this appointment', 400);
  if (['COMPLETED', 'CANCELLED'].includes(appt.status)) throw new AppError('Cannot reschedule a completed or cancelled appointment', 400);

  // Validate new slot
  const newSlot = await prisma.timeSlot.findUnique({ where: { id: newTimeSlotId } });
  if (!newSlot || !newSlot.isAvailable) throw new AppError('New time slot is not available', 400);

  await prisma.$transaction(async (tx) => {
    // Free old slot
    await tx.timeSlot.update({ where: { id: appt.timeSlotId }, data: { isAvailable: true } });
    // Book new slot
    await tx.timeSlot.update({ where: { id: newTimeSlotId }, data: { isAvailable: false } });
    // Update appointment
    await tx.appointment.update({
      where: { id },
      data: {
        timeSlotId: newTimeSlotId,
        rescheduleReason: reason || null,
        rescheduledFrom: appt.timeSlotId,
        status: 'CONFIRMED',
      },
    });
  });

  // Notify both parties
  const notifyUserId = req.user.id === appt.customerId ? appt.provider.userId : appt.customerId;
  await prisma.notification.create({
    data: {
      userId: notifyUserId,
      title: 'Appointment Rescheduled',
      message: `Appointment for ${appt.service.name} has been rescheduled.${reason ? ` Reason: ${reason}` : ''}`,
      type: 'BOOKING',
      link: '/dashboard',
    },
  });

  const updated = await prisma.appointment.findUnique({
    where: { id },
    include: { service: true, timeSlot: true, payment: true },
  });

  res.json({ success: true, appointment: updated });
});

// ─── CANCEL APPOINTMENT ──────────────────────────────────

export const cancelAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { reason } = req.body;

  if (!reason) throw new AppError('Cancellation reason is required', 400);

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { provider: true, service: true, timeSlot: true, payment: true },
  });
  if (!appt) throw new AppError('Appointment not found', 404);

  // Only the customer or the provider can cancel
  if (appt.customerId !== req.user.id && appt.provider.userId !== req.user.id) {
    throw new AppError('Unauthorized', 403);
  }

  if (['COMPLETED', 'CANCELLED'].includes(appt.status)) throw new AppError('Cannot cancel this appointment', 400);

  // Calculate refund (if paid)
  let refundAmount = 0;
  if (appt.payment && appt.payment.status === 'SUCCESS') {
    // If cancelled > 24h before slot → full refund. Otherwise 50% charge.
    const slotTime = new Date(appt.timeSlot.startTime).getTime();
    const now = Date.now();
    const hoursBeforeSlot = (slotTime - now) / (1000 * 60 * 60);

    if (hoursBeforeSlot > 24) {
      refundAmount = appt.payment.amount; // full refund
    } else {
      refundAmount = appt.payment.amount * 0.5; // 50% refund
    }

    // Update payment status
    await prisma.payment.update({
      where: { id: appt.payment.id },
      data: { status: 'REFUNDED' },
    });
  }

  await prisma.$transaction(async (tx) => {
    // Free slot
    await tx.timeSlot.update({ where: { id: appt.timeSlotId }, data: { isAvailable: true } });
    // Update appointment
    await tx.appointment.update({
      where: { id },
      data: { status: 'CANCELLED', cancellationReason: reason },
    });
  });

  // Notify both parties
  const notifyUserId = req.user.id === appt.customerId ? appt.provider.userId : appt.customerId;
  await prisma.notification.create({
    data: {
      userId: notifyUserId,
      title: 'Appointment Cancelled',
      message: `Appointment for ${appt.service.name} has been cancelled. Reason: ${reason}${refundAmount > 0 ? `. Refund: ₹${refundAmount.toFixed(2)}` : ''}`,
      type: 'BOOKING',
      link: '/dashboard',
    },
  });

  // Notify the person who cancelled too
  await prisma.notification.create({
    data: {
      userId: req.user.id,
      title: 'Cancellation Confirmed',
      message: `Your cancellation for ${appt.service.name} has been processed.${refundAmount > 0 ? ` Refund: ₹${refundAmount.toFixed(2)}` : ''}`,
      type: 'BOOKING',
      link: '/dashboard',
    },
  });

  res.json({ success: true, message: 'Appointment cancelled', refundAmount });
});

