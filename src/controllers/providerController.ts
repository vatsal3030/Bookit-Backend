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

const addOnSchema = z.object({
  name: z.string().min(2),
  price: z.number().min(0),
  duration: z.number().int().min(0).default(0),
});

const promoCodeSchema = z.object({
  code: z.string().min(3).toUpperCase(),
  discountType: z.enum(['PERCENTAGE', 'FLAT']).default('PERCENTAGE'),
  discountValue: z.number().min(1),
  maxUses: z.number().int().min(1).optional(),
  validUntil: z.string().optional(),
}).refine(data => {
  if (data.discountType === 'PERCENTAGE' && data.discountValue > 100) return false;
  return true;
}, { message: "Percentage discount cannot exceed 100", path: ['discountValue'] });

const timeSlotSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  serviceId: z.string().optional(),
  staffId: z.string().optional(),
});

const bulkSlotSchema = z.object({
  date: z.string(),
  serviceId: z.string().optional(),
  staffId: z.string().optional(),
  slots: z.array(z.object({
    startTime: z.string(),
    endTime: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
  })),
});

const staffSchema = z.object({
  name: z.string().min(2),
  role: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
});

// ─── GET PROVIDER PROFILE ────────────────────────────────

export const getProviderProfile = asyncHandler(async (req: any, res: Response) => {
  const id = req.params.id as string;

  const provider = await prisma.serviceProvider.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true, contactNo: true } },
      services: { 
        where: { isActive: true }, 
        include: { addOns: { where: { isActive: true } } },
        orderBy: { createdAt: 'desc' } 
      },
      reviews: {
        include: { customer: { select: { name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      promoCodes: { where: { isActive: true } },
      teamMembers: { where: { isActive: true } },
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
  
  let updated;
  if (!existing) {
    updated = await prisma.serviceProvider.create({
      data: {
        userId: req.user.id,
        businessName: data.businessName || '',
        category: data.category || 'Other',
        description: data.description,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
      },
      include: { user: { select: { name: true, email: true, avatar: true } }, services: true }
    });
  } else {
    updated = await prisma.serviceProvider.update({
      where: { userId: req.user.id },
      data,
      include: {
        user: { select: { name: true, email: true, avatar: true } },
        services: true,
      },
    });
  }

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

// ─── ADD SERVICE ADD-ON ──────────────────────────────────

export const addServiceAddOn = asyncHandler(async (req: AuthRequest, res: Response) => {
  const serviceId = req.params.serviceId as string;
  const data = addOnSchema.parse(req.body);

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) throw new AppError('Service not found', 404);

  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider || service.providerId !== provider.id) throw new AppError('Unauthorized', 403);

  const addOn = await prisma.serviceAddOn.create({
    data: { ...data, serviceId },
  });

  res.status(201).json({ success: true, addOn });
});

// ─── UPDATE SERVICE ADD-ON ───────────────────────────────

export const updateServiceAddOn = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const data = addOnSchema.partial().parse(req.body);

  const addOn = await prisma.serviceAddOn.findUnique({ where: { id }, include: { service: true } });
  if (!addOn) throw new AppError('Add-on not found', 404);

  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider || addOn.service.providerId !== provider.id) throw new AppError('Unauthorized', 403);

  const updated = await prisma.serviceAddOn.update({ where: { id }, data });
  res.json({ success: true, addOn: updated });
});

// ─── DELETE SERVICE ADD-ON ───────────────────────────────

export const deleteServiceAddOn = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const addOn = await prisma.serviceAddOn.findUnique({ where: { id }, include: { service: true } });
  if (!addOn) throw new AppError('Add-on not found', 404);

  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider || addOn.service.providerId !== provider.id) throw new AppError('Unauthorized', 403);

  await prisma.serviceAddOn.update({ where: { id }, data: { isActive: false } });
  res.json({ success: true, message: 'Add-on deactivated' });
});

// ─── CREATE PROMO CODE ───────────────────────────────────

export const createPromoCode = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = promoCodeSchema.parse(req.body);

  const provider = await prisma.serviceProvider.findUnique({ 
    where: { userId: req.user.id },
    include: { services: true }
  });
  if (!provider) throw new AppError('Provider profile not found', 404);

  // Validate limits based on type to prevent logical financial errors
  if (data.discountType === 'PERCENTAGE' && (data.discountValue <= 0 || data.discountValue > 100)) {
    throw new AppError('Percentage discount must be between 1 and 100', 400);
  }

  if (data.discountType === 'FLAT' && provider.services.length > 0) {
    const activeServices = provider.services.filter(s => s.isActive);
    if (activeServices.length > 0) {
      const minPrice = Math.min(...activeServices.map(s => s.baseFee));
      if (data.discountValue >= minPrice) {
        throw new AppError(`Flat discount (₹${data.discountValue}) cannot be greater than or equal to your cheapest service (₹${minPrice})`, 400);
      }
    }
  }

  const existing = await prisma.promoCode.findFirst({
    where: { providerId: provider.id, code: data.code }
  });
  if (existing) throw new AppError('Promo code already exists', 400);

  const promoCode = await prisma.promoCode.create({
    data: {
      ...data,
      providerId: provider.id,
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
    },
  });

  res.status(201).json({ success: true, promoCode });
});

// ─── DELETE PROMO CODE ───────────────────────────────────

export const deletePromoCode = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;

  const promoCode = await prisma.promoCode.findUnique({ where: { id } });
  if (!promoCode) throw new AppError('Promo code not found', 404);

  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider || promoCode.providerId !== provider.id) throw new AppError('Unauthorized', 403);

  // Soft delete
  await prisma.promoCode.update({ where: { id }, data: { isActive: false } });
  res.json({ success: true, message: 'Promo code deactivated' });
});

// ─── ADD STAFF / TEAM MEMBER ─────────────────────────────

export const addStaff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = staffSchema.parse(req.body);
  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider) throw new AppError('Provider profile not found', 404);

  const staff = await prisma.teamMember.create({
    data: { ...data, providerId: provider.id },
  });
  res.status(201).json({ success: true, staff });
});

// ─── UPDATE STAFF / TEAM MEMBER ──────────────────────────

export const updateStaff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = staffSchema.partial().parse(req.body);
  const id = req.params.id as string;
  const staff = await prisma.teamMember.findUnique({ where: { id } });
  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  
  if (!staff || !provider || staff.providerId !== provider.id) throw new AppError('Staff not found or unauthorized', 404);
  
  const updated = await prisma.teamMember.update({ where: { id }, data });
  res.json({ success: true, staff: updated });
});

// ─── DELETE STAFF / TEAM MEMBER ──────────────────────────

export const deleteStaff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const staff = await prisma.teamMember.findUnique({ where: { id } });
  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });

  if (!staff || !provider || staff.providerId !== provider.id) throw new AppError('Unauthorized', 403);

  // Soft delete Staff
  await prisma.teamMember.update({ where: { id }, data: { isActive: false } });
  res.json({ success: true, message: 'Staff deactivated' });
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
      title: data.title || null,
      description: data.description || null,
      serviceId: data.serviceId || null,
      staffId: data.staffId || null,
    },
    include: { 
      service: { select: { id: true, name: true, category: true } },
      staff: { select: { id: true, name: true, role: true } }
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
      title: s.title || null,
      description: s.description || null,
      serviceId: data.serviceId || null,
      staffId: data.staffId || null,
    })),
  });

  res.status(201).json({ success: true, count: slots.count });
});

// ─── GET TIME SLOTS ──────────────────────────────────────

export const getTimeSlots = asyncHandler(async (req: any, res: Response) => {
  const providerId = req.params.providerId as string;
  const { date, endDate } = req.query;

  const where: any = { providerId };
  if (date) {
    const d = new Date(String(date));
    if (endDate) {
      // Range query: return all slots between date and endDate
      const ed = new Date(String(endDate));
      ed.setDate(ed.getDate() + 1);
      where.date = { gte: d, lt: ed };
    } else {
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      where.date = { gte: d, lt: nextDay };
    }
  }

  const slots = await prisma.timeSlot.findMany({
    where,
    include: { service: { select: { id: true, name: true, category: true } } },
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

  const [totalAppointments, upcomingAppointments, completedAppointments, onlineRevenue, offlineRevenue, recentAppointments] = await Promise.all([
    prisma.appointment.count({ where: { providerId: provider.id } }),
    prisma.appointment.count({ where: { providerId: provider.id, status: 'CONFIRMED' } }),
    prisma.appointment.count({ where: { providerId: provider.id, status: 'COMPLETED' } }),
    prisma.payment.aggregate({
      where: { appointment: { providerId: provider.id }, status: 'SUCCESS' },
      _sum: { amount: true },
    }),
    prisma.appointment.aggregate({
      where: { providerId: provider.id, status: 'COMPLETED', payment: { is: null } },
      _sum: { totalAmount: true },
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
      totalRevenue: (onlineRevenue._sum.amount || 0) + (offlineRevenue._sum.totalAmount || 0),
      rating: provider.rating,
      reviewCount: provider.reviewCount,
    },
    recentAppointments,
  });
});

// ─── PROVIDER ANALYTICS (TIME-SERIES) ────────────────────

export const getProviderAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const provider = await prisma.serviceProvider.findUnique({ where: { userId: req.user.id } });
  if (!provider) throw new AppError('Provider profile not found', 404);

  // Get data for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const appointments = await prisma.appointment.findMany({
    where: { 
      providerId: provider.id,
      createdAt: { gte: thirtyDaysAgo }
    },
    select: {
      status: true,
      createdAt: true,
      amount: true,
      totalAmount: true,
      payment: { select: { status: true } }
    }
  });

  // Group by day (YYYY-MM-DD)
  const dailyData: Record<string, { bookings: number, revenue: number }> = {};
  
  // Initialize last 30 days with 0
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    dailyData[dateStr] = { bookings: 0, revenue: 0 };
  }

  appointments.forEach(appt => {
    const dateStr = appt.createdAt.toISOString().split('T')[0];
    if (dailyData[dateStr]) {
      dailyData[dateStr].bookings += 1;
      
      // Calculate revenue (only consider successful or completed payments/appointments for revenue)
      if (appt.payment?.status === 'SUCCESS' || appt.status === 'COMPLETED') {
         dailyData[dateStr].revenue += (appt.totalAmount || appt.amount);
      }
    }
  });

  const chartData = Object.keys(dailyData).map(date => ({
    date,
    bookings: dailyData[date].bookings,
    revenue: dailyData[date].revenue
  }));

  res.json({ success: true, analytics: chartData });
});
