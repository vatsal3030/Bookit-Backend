import { Router } from 'express';
import { createReview, getProviderReviews, getMyReviews } from '../controllers/reviewController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();

router.post('/', authMiddleware, createReview);
router.get('/my', authMiddleware, getMyReviews);
router.get('/provider/:providerId', getProviderReviews);

export default router;
