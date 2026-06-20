import { Queue } from 'bullmq';
import { connection } from '../config/redis';

const QUEUE_NAME = 'image-processing';

// Initialize BullMQ Queue
export const imageQueue = new Queue(QUEUE_NAME, {
  connection
});

/**
 * Push an image processing job into the Redis-backed BullMQ queue
 */
export async function addJobToQueue(jobId: string, imageReference: string): Promise<void> {
  try {
    const existingJob = await imageQueue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (state === 'completed' || state === 'failed') {
        await existingJob.remove();
      } else {
        console.log(`[Queue] Job ID ${jobId} is already queued with BullMQ state: ${state}`);
        return;
      }
    }

    await imageQueue.add(
      'process-image',
      { jobId, imageReference },
      {
        jobId,
        attempts: 3, // Retry up to 3 times on failure
        backoff: {
          type: 'exponential',
          delay: 5000 // Start with 5-second backoff
        },
        removeOnComplete: true, // Auto-clean completed jobs to save Redis memory
        removeOnFail: false // Keep failed jobs for inspection
      }
    );
    console.log(`[Queue] Successfully enqueued Job ID: ${jobId} with reference: ${imageReference}`);
  } catch (error) {
    console.error(`[Queue] Failed to enqueue Job ID ${jobId}:`, error);
    throw error;
  }
}

export default addJobToQueue;
