import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/authMiddleware';
import { asyncHandler, AppError } from '../utils/errorHandler';

// ─── SCHEMAS ─────────────────────────────────────────────

const reviewSchema = z.object({
  appointmentId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// ─── CREATE REVIEW ───────────────────────────────────────

export const createReview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = reviewSchema.parse(req.body);

  const appointment = await prisma.appointment.findUnique({
    where: { id: data.appointmentId },
    include: { review: true },
  });

  if (!appointment) throw new AppError('Appointment not found', 404);
  if (appointment.customerId !== req.user.id) throw new AppError('Unauthorized', 403);
  if (appointment.status !== 'COMPLETED') throw new AppError('Can only review completed appointments', 400);
  if (appointment.review) throw new AppError('Review already exists for this appointment', 400);

  const review = await prisma.review.create({
    data: {
      customerId: req.user.id,
      providerId: appointment.providerId,
      appointmentId: data.appointmentId,
      rating: data.rating,
      comment: data.comment,
    },
  });

  // Update provider's average rating
  const providerReviews = await prisma.review.aggregate({
    where: { providerId: appointment.providerId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.serviceProvider.update({
    where: { id: appointment.providerId },
    data: {
      rating: Math.round((providerReviews._avg.rating || 0) * 10) / 10,
      reviewCount: providerReviews._count.rating,
    },
  });

  // Create notification for provider
  const provider = await prisma.serviceProvider.findUnique({ where: { id: appointment.providerId } });
  if (provider) {
    await prisma.notification.create({
      data: {
        userId: provider.userId,
        title: 'New Review',
        message: `You received a ${data.rating}-star review!`,
        type: 'REVIEW',
        link: `/dashboard/reviews`,
      },
    });
  }

  res.status(201).json({ success: true, review });
});

// ─── GET PROVIDER REVIEWS ────────────────────────────────

export const getProviderReviews = asyncHandler(async (req: any, res: Response) => {
  const providerId = req.params.providerId as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { providerId },
      include: {
        customer: { select: { name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.review.count({ where: { providerId } }),
  ]);

  res.json({
    success: true,
    reviews,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ─── GET MY REVIEWS ──────────────────────────────────────

export const getMyReviews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const reviews = await prisma.review.findMany({
    where: { customerId: req.user.id },
    include: {
      provider: {
        include: { user: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, reviews });
});
