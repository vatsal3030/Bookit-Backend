import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/authMiddleware';
import { asyncHandler, AppError } from '../utils/errorHandler';

// ─── GET NOTIFICATIONS ───────────────────────────────────

export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50, // Limit to recent 50
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: req.user.id, isRead: false },
  });

  res.json({ success: true, notifications, unreadCount });
});

// ─── MARK AS READ ────────────────────────────────────────

export const markAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== req.user.id) {
    throw new AppError('Notification not found', 404);
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  res.json({ success: true, notification: updated });
});

// ─── MARK ALL AS READ ────────────────────────────────────

export const markAllAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data: { isRead: true },
  });

  res.json({ success: true, message: 'All notifications marked as read' });
});

// ─── CLEAR ALL ───────────────────────────────────────────

export const clearAll = asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.notification.deleteMany({
    where: { userId: req.user.id },
  });

  res.json({ success: true, message: 'All notifications deleted' });
});
