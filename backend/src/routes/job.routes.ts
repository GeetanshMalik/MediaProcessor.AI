import { Router } from 'express';
import { uploadJob, getJobs, getJobById, retryJob, deleteJob, getJobStats } from '../controllers/job.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { uploadMiddleware } from '../middlewares/upload.middleware';

const router = Router();

// Protect all job endpoints
router.use(authMiddleware);

// Endpoint mappings — stats must come before :id to avoid route conflict
router.post('/upload', uploadMiddleware, uploadJob);
router.get('/stats', getJobStats);
router.get('/', getJobs);
router.get('/:id', getJobById);
router.post('/:id/retry', retryJob);
router.delete('/:id', deleteJob);

export default router;
