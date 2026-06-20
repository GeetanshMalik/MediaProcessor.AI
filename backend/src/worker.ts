import dotenv from 'dotenv';
dotenv.config();

// Import the worker processor to initialize the BullMQ worker listener
import './workers/job.worker';
import { recoverInterruptedJobs } from './workers/job-recovery';

console.log('[Worker Service] Background worker initialized and listening to "image-processing" queue...');

recoverInterruptedJobs()
  .then(({ recoveredCount }) => {
    if (recoveredCount > 0) {
      console.log(`[Worker Service] Re-queued ${recoveredCount} pending or interrupted processing job(s).`);
    }
  })
  .catch((error) => {
    console.error('[Worker Service] Failed to recover interrupted jobs:', error);
  });
