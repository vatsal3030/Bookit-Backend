import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/authMiddleware';
import { asyncHandler } from '../utils/errorHandler';

// ─── GET NOTIFICATIONS ───────────────────────────────────

export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: req.user.id, isRead: false },
  });

  res.json({ success: true, notifications, unreadCount });
});

// ─── MARK AS READ ────────────────────────────────────────

export const markAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  await prisma.notification.updateMany({
    where: { id, userId: req.user.id },
    data: { isRead: true },
  });

  res.json({ success: true });
});

// ─── MARK ALL READ ───────────────────────────────────────

export const markAllRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data: { isRead: true },
  });

  res.json({ success: true });
});
