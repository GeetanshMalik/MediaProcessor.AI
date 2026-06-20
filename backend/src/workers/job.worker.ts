import { Worker, Job as BullJob, UnrecoverableError } from 'bullmq';
import { prisma } from '../database/db';
import { connection } from '../config/redis';
import { AIService } from '../services/ai.service';
import path from 'path';
import fs from 'fs';

const QUEUE_NAME = 'image-processing';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

function isNonRetryableProviderError(message: string) {
  const nonRetryableMarkers = [
    'PERMISSION_DENIED',
    'Unauthorized',
    'Invalid token',
    'Invalid credentials',
    'API key',
    'not configured',
    'Repository Not Found',
    'gated',
    "isn't deployed by any Inference Provider",
    'Model not supported by provider'
  ];

  return nonRetryableMarkers.some(marker => message.toLowerCase().includes(marker.toLowerCase()));
}

/**
 * Worker processor function executing sequential AI pipeline
 */
async function processImageJob(bullJob: BullJob) {
  const { jobId } = bullJob.data;
  console.log(`[Worker] Running AI pipeline on Job ID: ${jobId}`);

  // 1. Fetch the job from PostgreSQL
  const job = await prisma.job.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    console.warn(`[Worker] Job ID ${jobId} not found in database. Skipping.`);
    return;
  }

  if (job.status === 'completed') {
    console.warn(`[Worker] Job ID ${jobId} is already completed. Skipping duplicate queue entry.`);
    return;
  }

  // 2. Set job status to 'processing'
  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'processing' }
  });

  try {
    // Determine the local file path on the shared volume
    const filename = path.basename(job.fileUrl);
    const localFilePath = path.join(UPLOAD_DIR, filename);

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Media file not found on disk at: ${localFilePath}`);
    }

    // --- AI Pipeline Step 1: Image Captioning ---
    console.log(`[Worker] Job ${jobId}: Generating image caption...`);
    const caption = await AIService.generateCaption(localFilePath);

    // --- AI Pipeline Step 2: Object Detection ---
    console.log(`[Worker] Job ${jobId}: Detecting objects...`);
    const detectionResults = await AIService.detectObjects(localFilePath);

    // --- AI Pipeline Step 3: Content Safety Classification ---
    console.log(`[Worker] Job ${jobId}: Running safety classification...`);
    const safetyResults = await AIService.classifySafety(localFilePath);

    // 3. Update job details in database
    const completedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        caption,
        labels: detectionResults.labels,
        flagged: safetyResults.flagged,
        flagCategory: safetyResults.flagCategory
      }
    });

    // 4. Create user notifications based on safety classification
    let notificationMessage = `Your upload Job #${completedJob.id.substring(0, 8)} completed successfully.`;
    if (safetyResults.flagged) {
      notificationMessage = `Your upload Job #${completedJob.id.substring(0, 8)} was flagged for containing unsafe content (${safetyResults.flagCategory}).`;
    }

    await prisma.notification.create({
      data: {
        userId: completedJob.userId,
        jobId: completedJob.id,
        message: notificationMessage
      }
    });

    console.log(`[Worker] Job ID ${jobId} completed successfully. Flagged: ${safetyResults.flagged}`);
  } catch (error: any) {
    console.error(`[Worker] Pipeline failed for Job ID ${jobId}:`, error);
    const errorMessage = error.message || 'An error occurred during AI pipeline processing.';

    // Update job status to failed with error message
    const failedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage
      }
    });

    // Create user notification for failed job
    await prisma.notification.create({
      data: {
        userId: failedJob.userId,
        jobId: failedJob.id,
        message: `Your upload Job #${failedJob.id.substring(0, 8)} failed processing.`
      }
    }).catch(err => console.error('Failed to create failure notification:', err));

    if (isNonRetryableProviderError(errorMessage)) {
      throw new UnrecoverableError(errorMessage);
    }

    // Re-throw so BullMQ handles retry strategies
    throw error;
  }
}

// Initialize and export worker instance
export const imageWorker = new Worker(QUEUE_NAME, processImageJob, {
  connection,
  concurrency: 2
});

imageWorker.on('active', (job) => {
  console.log(`[Worker] Job ${job.id} is active.`);
});

imageWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed.`);
});

imageWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

imageWorker.on('error', (err) => {
  console.error('[Worker] Worker error:', err);
});

export default imageWorker;
