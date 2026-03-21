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
  notes: z.string().optional(),
});

// ─── GET APPOINTMENTS ────────────────────────────────────

export const getAppointments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const isCustomer = req.user.role === 'CUSTOMER';
  const status = req.query.status as string;

  const where: any = isCustomer
    ? { customerId: req.user.id }
    : { provider: { userId: req.user.id } };

  if (status && ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(status)) {
    where.status = status;
  }

  const appointments = await prisma.appointment.findMany({
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
  });

  res.json({ success: true, appointments });
});

// ─── BOOK APPOINTMENT ────────────────────────────────────

export const bookAppointment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { providerId, serviceId, timeSlotId, notes } = appointmentSchema.parse(req.body);

  const slot = await prisma.timeSlot.findUnique({ where: { id: timeSlotId } });
  if (!slot || !slot.isAvailable) throw new AppError('Time slot is not available', 400);

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new AppError('Service not found', 404);

  const amount = service.baseFee + service.tax;

  const appointment = await prisma.$transaction(async (tx) => {
    await tx.timeSlot.update({ where: { id: timeSlotId }, data: { isAvailable: false } });

    const appt = await tx.appointment.create({
      data: {
        customerId: req.user.id,
        providerId,
        serviceId,
        timeSlotId,
        amount,
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
