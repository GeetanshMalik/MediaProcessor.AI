import { prisma } from '../database/db';
import { addJobToQueue } from '../queues/job.queue';

const DEFAULT_STALE_PROCESSING_MINUTES = 15;

function getPositiveIntegerEnv(name: string, fallback: number) {
  const configuredValue = Number(process.env[name]);
  return Number.isFinite(configuredValue) && configuredValue > 0
    ? Math.floor(configuredValue)
    : fallback;
}

export function getStaleProcessingCutoffDate(now = new Date()) {
  const staleAfterMinutes = getPositiveIntegerEnv(
    'JOB_STALE_PROCESSING_MINUTES',
    DEFAULT_STALE_PROCESSING_MINUTES
  );

  return new Date(now.getTime() - staleAfterMinutes * 60 * 1000);
}

/**
 * WARNING: Concurrency Tradeoff & Scaling Limitations
 * 
 * In this implementation, recoverInterruptedJobs() is called directly during worker boot (in worker.ts).
 * Under high scalability constraints (e.g., 20+ concurrent Worker instances), running this recovery pass
 * on every worker container startup can result in race conditions where multiple workers search for,
 * update, and re-enqueue the same stale/pending jobs simultaneously. This can cause database write lock
 * contention and duplicate job submissions to the queue.
 * 
 * Production Recommendation:
 * For high-load, multi-instance production environments, do NOT invoke this function inside the worker startup script.
 * Instead, disable startup recovery and execute recoverInterruptedJobs() as a single-instance scheduled cron job
 * running every 10-15 minutes using an external orchestrator/scheduler (e.g. Cloudflare Worker Crons, Upstash QStash,
 * or a single dedicated manager service node).
 */
export async function recoverInterruptedJobs(now = new Date()) {
  const staleProcessingCutoff = getStaleProcessingCutoffDate(now);
  const jobsToRecover = await prisma.job.findMany({
    where: {
      OR: [
        { status: 'pending' },
        {
          status: 'processing',
          updatedAt: {
            lt: staleProcessingCutoff
          }
        }
      ]
    },
    select: {
      id: true,
      status: true,
      fileUrl: true,
      updatedAt: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  for (const job of jobsToRecover) {
    if (job.status === 'processing') {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'pending',
          errorMessage: null
        }
      });
    }

    await addJobToQueue(job.id, job.fileUrl);
  }

  return {
    recoveredCount: jobsToRecover.length,
    staleProcessingCutoff
  };
}
