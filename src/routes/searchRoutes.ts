import { Router } from 'express';
import { searchProviders, getCategories } from '../controllers/searchController';

const router = Router();

router.get('/providers', searchProviders);
router.get('/categories', getCategories);

export default router;
