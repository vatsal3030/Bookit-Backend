import { Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../prisma';
import { signToken } from '../utils/jwt';
import { AuthRequest } from '../middlewares/authMiddleware';
import { asyncHandler, AppError } from '../utils/errorHandler';

// ─── VALIDATION SCHEMAS ──────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['CUSTOMER', 'PROVIDER']).optional(),
  contactNo: z.string().optional(),
  location: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  contactNo: z.string().optional(),
  location: z.string().optional(),
  avatar: z.string().url().optional(),
});

// ─── REGISTER ────────────────────────────────────────────

export const register = asyncHandler(async (req: any, res: Response) => {
  const data = registerSchema.parse(req.body);

  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) throw new AppError('Email already registered', 400);

  const hashedPassword = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashedPassword,
      role: (data.role as any) || 'CUSTOMER',
      contactNo: data.contactNo,
      location: data.location,
    },
  });

  // Auto-create provider profile if role is PROVIDER
  if (user.role === 'PROVIDER') {
    await prisma.serviceProvider.create({
      data: { userId: user.id, businessName: data.name },
    });
  }

  const token = signToken({ id: user.id, role: user.role });
  const { password: _, refreshToken: __, ...safeUser } = user;

  res.status(201).json({ success: true, user: safeUser, token });
});

// ─── LOGIN ───────────────────────────────────────────────

export const login = asyncHandler(async (req: any, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) throw new AppError('Invalid email or password', 401);

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new AppError('Invalid email or password', 401);

  const token = signToken({ id: user.id, role: user.role });
  const { password: _, refreshToken: __, ...safeUser } = user;

  res.json({ success: true, user: safeUser, token });
});

// ─── GOOGLE AUTH ─────────────────────────────────────────

export const googleAuth = asyncHandler(async (req: any, res: Response) => {
  const { email, name, googleId, avatar } = req.body;

  if (!email || !googleId) throw new AppError('Missing Google credentials', 400);

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Create new user from Google
    user = await prisma.user.create({
      data: {
        name: name || email.split('@')[0],
        email,
        googleId,
        avatar,
        isVerified: true,
        role: 'CUSTOMER',
      },
    });
  } else if (!user.googleId) {
    // Link Google account to existing user
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId, avatar: user.avatar || avatar, isVerified: true },
    });
  }

  const token = signToken({ id: user.id, role: user.role });
  const { password: _, refreshToken: __, ...safeUser } = user;

  res.json({ success: true, user: safeUser, token });
});

// ─── GET PROFILE ─────────────────────────────────────────

export const getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true, name: true, email: true, avatar: true, role: true,
      contactNo: true, location: true, isVerified: true, createdAt: true,
      providerProfile: {
        include: {
          services: { where: { isActive: true } },
          _count: { select: { appointments: true, reviews: true } },
        },
      },
    },
  });

  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, user });
});

// ─── UPDATE PROFILE ──────────────────────────────────────

export const updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = updateProfileSchema.parse(req.body);

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    select: {
      id: true, name: true, email: true, avatar: true, role: true,
      contactNo: true, location: true, isVerified: true,
    },
  });

  res.json({ success: true, user });
});

// ─── SWITCH ROLE ─────────────────────────────────────────

export const switchRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const currentRole = req.user.role;
  const newRole = currentRole === 'CUSTOMER' ? 'PROVIDER' : 'CUSTOMER';

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { role: newRole }
  });

  const token = signToken({ id: user.id, role: user.role });

  res.json({
    success: true,
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }
  });
});
