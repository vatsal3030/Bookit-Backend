import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/authMiddleware';
import { asyncHandler, AppError } from '../utils/errorHandler';

// ─── GET ALL USERS ───────────────────────────────────────

export const getAllUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, isVerified: true, createdAt: true, avatar: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count(),
  ]);

  res.json({ success: true, users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

// ─── GET ALL PROVIDERS ───────────────────────────────────

export const getAllProviders = asyncHandler(async (req: AuthRequest, res: Response) => {
  const providers = await prisma.serviceProvider.findMany({
    include: {
      user: { select: { name: true, email: true, avatar: true } },
      _count: { select: { services: true, appointments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, providers });
});

// ─── VERIFY PROVIDER ─────────────────────────────────────

export const verifyProvider = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const provider = await prisma.serviceProvider.findUnique({ where: { id } });
  if (!provider) throw new AppError('Provider not found', 404);

  const updated = await prisma.serviceProvider.update({
    where: { id },
    data: { isVerified: true },
  });

  // Notify provider
  await prisma.notification.create({
    data: {
      userId: provider.userId,
      title: 'Account Verified! 🎉',
      message: 'Your provider account has been verified. You can now accept bookings.',
      type: 'SYSTEM',
    },
  });

  res.json({ success: true, provider: updated });
});

// ─── ADMIN DASHBOARD STATS ──────────────────────────────

export const getDashboardStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [totalUsers, totalProviders, totalAppointments, onlineRevenue, offlineRevenue, recentAppointments] = await Promise.all([
    prisma.user.count(),
    prisma.serviceProvider.count(),
    prisma.appointment.count(),
    prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
    prisma.appointment.aggregate({ where: { status: 'COMPLETED', payment: { is: null } }, _sum: { totalAmount: true } }),
    prisma.appointment.findMany({
      include: {
        customer: { select: { name: true } },
        provider: { include: { user: { select: { name: true } } } },
        service: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  res.json({
    success: true,
    stats: {
      totalUsers,
      totalProviders,
      totalAppointments,
      totalRevenue: (onlineRevenue._sum.amount || 0) + (offlineRevenue._sum.totalAmount || 0),
    },
    recentAppointments,
  });
});

// ─── GET ALL APPOINTMENTS ────────────────────────────────

export const getAllAppointments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as string;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: {
        customer: { select: { name: true, email: true } },
        provider: { include: { user: { select: { name: true } } } },
        service: { select: { name: true } },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.appointment.count({ where }),
  ]);

  res.json({
    success: true,
    appointments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
