import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/authMiddleware';
import { asyncHandler, AppError } from '../utils/errorHandler';

// ─── SCHEMAS ─────────────────────────────────────────────

const startConversationSchema = z.object({
  participantId: z.string(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1),
});

// ─── START / GET CONVERSATION ────────────────────────────

export const getOrCreateConversation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { participantId } = startConversationSchema.parse(req.body);

  if (participantId === req.user.id) {
    throw new AppError('Cannot start a conversation with yourself', 400);
  }

  // Enforce chat restriction: Must have an appointment with each other (ignore if ADMIN)
  const isCustomOrProv = req.user.role === 'CUSTOMER' || req.user.role === 'PROVIDER';
  if (isCustomOrProv) {
    const participantUser = await prisma.user.findUnique({ where: { id: participantId } });
    if (participantUser?.role !== 'ADMIN') {
      const hasAppt = await prisma.appointment.findFirst({
        where: {
          OR: [
            { customerId: req.user.id, provider: { userId: participantId } },
            { customerId: participantId, provider: { userId: req.user.id } }
          ]
        }
      });
      if (!hasAppt) {
        throw new AppError('You can only message users you have a booking with.', 403);
      }
    }
  }

  // Ensure participants are sorted to prevent duplicates like A->B and B->A
  const [user1Id, user2Id] = [req.user.id, participantId].sort();

  let conversation = await prisma.conversation.findUnique({
    where: { user1Id_user2Id: { user1Id, user2Id } },
    include: {
      user1: { select: { id: true, name: true, avatar: true, role: true } },
      user2: { select: { id: true, name: true, avatar: true, role: true } },
    }
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { user1Id, user2Id },
      include: {
        user1: { select: { id: true, name: true, avatar: true, role: true } },
        user2: { select: { id: true, name: true, avatar: true, role: true } },
      }
    });
  }

  res.json({ success: true, conversation });
});

// ─── GET MY CONVERSATIONS ────────────────────────────────

export const getMyConversations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const where = {
    OR: [
      { user1Id: req.user.id },
      { user2Id: req.user.id },
    ]
  };

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        user1: { select: { id: true, name: true, avatar: true, role: true } },
        user2: { select: { id: true, name: true, avatar: true, role: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Get latest message
        },
        _count: {
          select: {
            messages: {
              where: {
                NOT: { senderId: req.user.id },
                isRead: false
              }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.conversation.count({ where })
  ]);

  const formatted = conversations.map(conv => {
    const otherUser = conv.user1Id === req.user.id ? conv.user2 : conv.user1;
    return {
      id: conv.id,
      otherUser,
      lastMessage: conv.messages[0] || null,
      unreadCount: conv._count.messages,
      updatedAt: conv.updatedAt,
    };
  });

  res.json({ success: true, conversations: formatted, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

// ─── GET MESSAGES ────────────────────────────────────────

export const getMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const conversationId = req.params.id as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId }
  });

  if (!conversation) throw new AppError('Conversation not found', 404);
  if (conversation.user1Id !== req.user.id && conversation.user2Id !== req.user.id) {
    throw new AppError('Unauthorized', 403);
  }

  // Mark all unread messages as read (page 1 only usually makes sense, but we'll do it for all requests)
  if (page === 1) {
    await prisma.message.updateMany({
      where: {
        conversationId,
        NOT: { senderId: req.user.id },
        isRead: false
      },
      data: { isRead: true }
    });
  }

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' }, // Get newest first for pagination
      skip,
      take: limit,
    }),
    prisma.message.count({ where: { conversationId } })
  ]);

  // Return in chronological order (oldest first for UI rendering)
  res.json({ success: true, messages: messages.reverse(), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

// ─── SEND MESSAGE ────────────────────────────────────────

export const sendMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const conversationId = req.params.id as string;
  const { content } = sendMessageSchema.parse(req.body);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId }
  });

  if (!conversation) throw new AppError('Conversation not found', 404);
  if (conversation.user1Id !== req.user.id && conversation.user2Id !== req.user.id) {
    throw new AppError('Unauthorized', 403);
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user.id,
      content,
    }
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() }
  });

  // Create notification for the recipient
  const recipientId = conversation.user1Id === req.user.id ? conversation.user2Id : conversation.user1Id;
  await prisma.notification.create({
    data: {
      userId: recipientId,
      title: 'New Message',
      message: `You have received a new message`,
      type: 'SYSTEM',
      link: '/dashboard/messages',
    }
  });

  res.status(201).json({ success: true, message });
});
