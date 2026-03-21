import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/authMiddleware';
import { asyncHandler, AppError } from '../utils/errorHandler';

// ─── SCHEMAS ─────────────────────────────────────────────

const updateProviderSchema = z.object({
  businessName: z.string().min(2).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  experience: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  coverImage: z.string().url().optional(),
  workingHours: z.string().optional(),
});

const serviceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  category: z.string(),
  duration: z.number().int().min(5).default(30),
  baseFee: z.number().min(0),
  tax: z.number().min(0).default(0),
});

const timeSlotSchema = z.object({
  date: z.string(), // ISO date string
  startTime: z.string(),
  endTime: z.string(),
});

const bulkSlotSchema = z.object({
  date: z.string(),
  slots: z.array(z.object({
    startTime: z.string(),
    endTime: z.string(),
  })),
});

// ─── GET PROVIDER PROFILE ────────────────────────────────

export const getProviderProfile = asyncHandler(async (req: any, res: Response) => {
  const id = req.params.id as string;

  const provider = await prisma.serviceProvider.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true, contactNo: true } },
      services: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
      reviews: {
        include: { customer: { select: { name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      _count: { select: { appointments: true, reviews: true } },
    },
  });

  if (!provider) throw new AppError('Provider not found', 404);
  res.json({ success: true, provider });
});

// ─── UPDATE PROVIDER PROFILE ─────────────────────────────

export const updateProviderProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = updateProviderSchema.parse(req.body);

  const existing = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!existing) throw new AppError('Provider profile not found', 404);

  const updated = await prisma.serviceProvider.update({
    where: { userId: req.user.id },
    data,
    include: {
      user: { select: { name: true, email: true, avatar: true } },
      services: true,
    },
  });

  res.json({ success: true, provider: updated });
});

// ─── ADD SERVICE ─────────────────────────────────────────

export const addService = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = serviceSchema.parse(req.body);

  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider) throw new AppError('Provider profile not found', 404);

  const service = await prisma.service.create({
    data: { ...data, providerId: provider.id },
  });

  res.status(201).json({ success: true, service });
});

// ─── UPDATE SERVICE ──────────────────────────────────────

export const updateService = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const data = serviceSchema.partial().parse(req.body);

  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) throw new AppError('Service not found', 404);

  // Verify ownership
  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider || service.providerId !== provider.id) throw new AppError('Unauthorized', 403);

  const updated = await prisma.service.update({ where: { id }, data });
  res.json({ success: true, service: updated });
});

// ─── DELETE SERVICE ──────────────────────────────────────

export const deleteService = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) throw new AppError('Service not found', 404);

  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider || service.providerId !== provider.id) throw new AppError('Unauthorized', 403);

  // Soft delete
  await prisma.service.update({ where: { id }, data: { isActive: false } });
  res.json({ success: true, message: 'Service deactivated' });
});

// ─── ADD TIME SLOT ───────────────────────────────────────

export const addTimeSlot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = timeSlotSchema.parse(req.body);

  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider) throw new AppError('Provider profile not found', 404);

  const slot = await prisma.timeSlot.create({
    data: {
      providerId: provider.id,
      date: new Date(data.date),
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
    },
  });

  res.status(201).json({ success: true, slot });
});

// ─── ADD BULK TIME SLOTS ─────────────────────────────────

export const addBulkTimeSlots = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = bulkSlotSchema.parse(req.body);

  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider) throw new AppError('Provider profile not found', 404);

  const slots = await prisma.timeSlot.createMany({
    data: data.slots.map(s => ({
      providerId: provider.id,
      date: new Date(data.date),
      startTime: new Date(s.startTime),
      endTime: new Date(s.endTime),
    })),
  });

  res.status(201).json({ success: true, count: slots.count });
});

// ─── GET TIME SLOTS ──────────────────────────────────────

export const getTimeSlots = asyncHandler(async (req: any, res: Response) => {
  const providerId = req.params.providerId as string;
  const { date } = req.query;

  const where: any = { providerId, isAvailable: true };
  if (date) {
    const d = new Date(String(date));
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    where.date = { gte: d, lt: nextDay };
  }

  const slots = await prisma.timeSlot.findMany({
    where,
    orderBy: { startTime: 'asc' },
  });

  res.json({ success: true, slots });
});

// ─── DELETE TIME SLOT ────────────────────────────────────

export const deleteTimeSlot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const slot = await prisma.timeSlot.findUnique({ where: { id } });
  if (!slot) throw new AppError('Time slot not found', 404);

  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider || slot.providerId !== provider.id) throw new AppError('Unauthorized', 403);

  await prisma.timeSlot.delete({ where: { id } });
  res.json({ success: true, message: 'Time slot deleted' });
});

// ─── PROVIDER DASHBOARD STATS ────────────────────────────

export const getDashboardStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider) throw new AppError('Provider profile not found', 404);

  const [totalAppointments, upcomingAppointments, completedAppointments, totalRevenue, recentAppointments] = await Promise.all([
    prisma.appointment.count({ where: { providerId: provider.id } }),
    prisma.appointment.count({ where: { providerId: provider.id, status: 'CONFIRMED' } }),
    prisma.appointment.count({ where: { providerId: provider.id, status: 'COMPLETED' } }),
    prisma.payment.aggregate({
      where: { appointment: { providerId: provider.id }, status: 'SUCCESS' },
      _sum: { amount: true },
    }),
    prisma.appointment.findMany({
      where: { providerId: provider.id },
      include: {
        customer: { select: { name: true, email: true, avatar: true } },
        service: { select: { name: true } },
        timeSlot: { select: { date: true, startTime: true, endTime: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  res.json({
    success: true,
    stats: {
      totalAppointments,
      upcomingAppointments,
      completedAppointments,
      totalRevenue: totalRevenue._sum.amount || 0,
      rating: provider.rating,
      reviewCount: provider.reviewCount,
    },
    recentAppointments,
  });
});
