import { Router } from 'express';
import {
  getOrCreateConversation,
  getMyConversations,
  getMessages,
  sendMessage,
} from '../controllers/messageController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

// All message routes require authentication
router.use(authMiddleware);

router.post('/conversations', getOrCreateConversation);
router.get('/conversations', getMyConversations);
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', sendMessage);

export default router;
