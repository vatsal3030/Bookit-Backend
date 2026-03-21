import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/errorHandler';

// ─── SEARCH PROVIDERS ────────────────────────────────────

export const searchProviders = asyncHandler(async (req: Request, res: Response) => {
  const { category, lat, lng, maxDistance, q } = req.query;

  // Base filter — only verified providers with active services
  const whereClause: any = {};

  if (category && String(category) !== 'all') {
    whereClause.OR = [
      { category: { contains: String(category), mode: 'insensitive' } },
      { services: { some: { category: { contains: String(category), mode: 'insensitive' }, isActive: true } } },
    ];
  }

  // Text search across name, business name, service names
  if (q) {
    const search = String(q);
    whereClause.OR = [
      { businessName: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { services: { some: { name: { contains: search, mode: 'insensitive' }, isActive: true } } },
      { category: { contains: search, mode: 'insensitive' } },
    ];
  }

  const providers = await prisma.serviceProvider.findMany({
    where: whereClause,
    include: {
      user: { select: { id: true, name: true, avatar: true, location: true } },
      services: { where: { isActive: true }, select: { id: true, name: true, category: true, baseFee: true, duration: true } },
      _count: { select: { reviews: true, appointments: true } },
    },
    orderBy: { rating: 'desc' },
  });

  // Haversine distance filter if coordinates provided
  if (lat && lng) {
    const userLat = parseFloat(String(lat));
    const userLng = parseFloat(String(lng));
    const maxDist = maxDistance ? parseFloat(String(maxDistance)) : 50; // Default 50km

    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // km

    const filtered = providers
      .map(p => {
        if (!p.lat || !p.lng) return { ...p, distance: null };
        const dLat = toRad(p.lat - userLat);
        const dLon = toRad(p.lng - userLng);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(userLat)) * Math.cos(toRad(p.lat)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = Math.round(R * c * 10) / 10;
        return { ...p, distance };
      })
      .filter(p => p.distance === null || p.distance <= maxDist)
      .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));

    return res.json({ success: true, providers: filtered });
  }

  res.json({ success: true, providers });
});

// ─── GET CATEGORIES ──────────────────────────────────────

export const getCategories = asyncHandler(async (_req: Request, res: Response) => {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    select: { category: true },
    distinct: ['category'],
  });

  const categories = services.map(s => s.category);
  res.json({ success: true, categories });
});
