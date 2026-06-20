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

    await addJobToQueue(job.id);
  }

  return {
    recoveredCount: jobsToRecover.length,
    staleProcessingCutoff
  };
}
