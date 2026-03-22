import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/errorHandler';

// ─── SEARCH PROVIDERS ────────────────────────────────────

export const searchProviders = asyncHandler(async (req: Request, res: Response) => {
  const { category, lat, lng, maxDistance, q, sortBy } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  // Base filter — only verified providers with active services
  const whereClause: any = { AND: [] };

  if (category && String(category) !== 'all') {
    whereClause.AND.push({
      OR: [
        { category: { contains: String(category), mode: 'insensitive' } },
        { services: { some: { category: { contains: String(category), mode: 'insensitive' }, isActive: true } } },
      ]
    });
  }

  // Text search across name, business name, service names
  if (q) {
    const search = String(q);
    whereClause.AND.push({
      OR: [
        { businessName: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { services: { some: { name: { contains: search, mode: 'insensitive' }, isActive: true } } },
        { category: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ]
    });
  }

  // If no filters were added, remove the empty AND array to prevent Prisma errors
  if (whereClause.AND.length === 0) {
    delete whereClause.AND;
  }

  const baseInclude = {
    user: { select: { id: true, name: true, avatar: true, location: true } },
    services: { where: { isActive: true }, select: { id: true, name: true, category: true, baseFee: true, duration: true } },
    _count: { select: { reviews: true, appointments: true } },
  };

  // Haversine distance and Custom Text Scoring filter
  const needsInMemorySort = !!(lat && lng) || !!q;

  if (needsInMemorySort) {
    const allProviders = await prisma.serviceProvider.findMany({
      where: whereClause,
      include: baseInclude,
    });

    const userLat = lat ? parseFloat(String(lat)) : null;
    const userLng = lng ? parseFloat(String(lng)) : null;
    const maxDist = maxDistance ? parseFloat(String(maxDistance)) : 50;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371;

    const processedSearch = q ? String(q).toLowerCase() : '';

    let processed = allProviders.map((p: any) => {
      // 1. Calculate Distance
      let distance = null;
      if (userLat !== null && userLng !== null && p.lat && p.lng) {
        const dLat = toRad(p.lat - userLat);
        const dLon = toRad(p.lng - userLng);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(userLat)) * Math.cos(toRad(p.lat)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distance = Math.round(R * c * 10) / 10;
      }

      // 2. Calculate Search Score
      let score = 0;
      if (processedSearch) {
        // Priority 1: Service Name / Category (100 pts)
        const matchingServices = p.services.filter((s: any) => 
          s.name.toLowerCase().includes(processedSearch) || 
          s.category.toLowerCase().includes(processedSearch)
        );
        if (matchingServices.length > 0) score += 100 + (matchingServices.length * 5); // Boost if multiple services match

        // Priority 2: Provider Name / Business Name (50 pts)
        if (p.businessName?.toLowerCase().includes(processedSearch)) score += 50;
        if (p.user?.name?.toLowerCase().includes(processedSearch)) score += 50;

        // Priority 3: Address / Location (10 pts)
        if (p.address?.toLowerCase().includes(processedSearch)) score += 10;
        if (p.category?.toLowerCase().includes(processedSearch)) score += 5; // Base provider category
      }

      return { ...p, distance, score };
    });

    if (userLat !== null && userLng !== null) {
      processed = processed.filter((p: any) => p.distance === null || p.distance <= maxDist);
    }

    // Sort based on sortBy parameter, then fallback to score/distance/rating
    const sortByStr = sortBy ? String(sortBy) : 'distance';

    processed.sort((a, b) => {
      // If text search, always prioritize by relevance score first
      if (q && a.score !== b.score) return b.score - a.score;

      switch (sortByStr) {
        case 'rating':
          return (b.rating ?? 0) - (a.rating ?? 0);
        case 'price_low': {
          const aMin = a.services?.length ? Math.min(...a.services.map((s: any) => s.baseFee || 0)) : Infinity;
          const bMin = b.services?.length ? Math.min(...b.services.map((s: any) => s.baseFee || 0)) : Infinity;
          return aMin - bMin;
        }
        case 'price_high': {
          const aMax = a.services?.length ? Math.max(...a.services.map((s: any) => s.baseFee || 0)) : 0;
          const bMax = b.services?.length ? Math.max(...b.services.map((s: any) => s.baseFee || 0)) : 0;
          return bMax - aMax;
        }
        case 'distance':
        default:
          if (userLat !== null && userLng !== null) {
            if (a.distance !== b.distance) return (a.distance ?? 999) - (b.distance ?? 999);
          }
          return (b.rating ?? 0) - (a.rating ?? 0);
      }
    });

    const total = processed.length;
    const paginated = processed.slice((page - 1) * limit, page * limit);
    return res.json({ success: true, providers: paginated, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  }

  // Database pagination if no geo-coordinates AND no exact query scoring needed
  const skip = (page - 1) * limit;
  const [providers, total] = await Promise.all([
    prisma.serviceProvider.findMany({
      where: whereClause,
      include: baseInclude,
      orderBy: { rating: 'desc' },
      skip,
      take: limit,
    }),
    prisma.serviceProvider.count({ where: whereClause })
  ]);

  res.json({ success: true, providers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
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
