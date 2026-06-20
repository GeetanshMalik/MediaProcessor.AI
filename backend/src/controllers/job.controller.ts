import { Request, Response } from 'express';
import { prisma } from '../database/db';
import { StorageService } from '../services/storage.service';
import { addJobToQueue } from '../queues/job.queue';

export function serializeJob(job: any, req: Request) {
  if (!job) return null;
  const protocol = req.protocol;
  const host = req.get('host');
  return {
    ...job,
    fileUrl: `${protocol}://${host}/jobs/${job.id}/image`
  };
}

const DEFAULT_DASHBOARD_TIME_ZONE = 'Asia/Kolkata';

function getDashboardTimeZone() {
  return process.env.APP_TIME_ZONE?.trim() || process.env.DASHBOARD_TIME_ZONE?.trim() || DEFAULT_DASHBOARD_TIME_ZONE;
}

export function formatDateKeyInTimeZone(date: Date, timeZone = getDashboardTimeZone()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Could not format date for time zone: ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

function dateKeyToUtcNoon(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function getRecentDateKeysInTimeZone(now = new Date(), days = 7, timeZone = getDashboardTimeZone()) {
  const todayKey = formatDateKeyInTimeZone(now, timeZone);
  const todayUtcNoon = dateKeyToUtcNoon(todayKey);
  const keys: string[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(todayUtcNoon);
    day.setUTCDate(todayUtcNoon.getUTCDate() - i);
    keys.push(formatDateKeyInTimeZone(day, timeZone));
  }

  return keys;
}

/**
 * Handle image upload and create background media processing job
 */
export async function uploadJob(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: {
          code: 'NO_FILE_UPLOADED',
          message: 'Please provide an image file to upload.'
        }
      });
    }

    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      });
    }

    const { filename, path: localFilePath } = req.file;

    // Upload to storage and get public URL
    const fileUrl = await StorageService.uploadFile(filename, localFilePath);

    // If using Cloudflare R2, clean up the local temp upload file on the API server immediately
    if (process.env.STORAGE_PROVIDER === 'r2') {
      try {
        const fs = require('fs');
        if (fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
        }
      } catch (err: any) {
        console.warn(`[API] Failed to clean up temp upload file: ${err.message}`);
      }
    }

    // Create database job in 'pending' status
    const job = await prisma.job.create({
      data: {
        userId: req.user.id,
        fileUrl: fileUrl,
        status: 'pending'
      }
    });

    // Enqueue the job for asynchronous processing
    await addJobToQueue(job.id, job.fileUrl);

    return res.status(201).json({
      jobId: job.id,
      status: job.status,
      fileUrl: `${req.protocol}://${req.get('host')}/jobs/${job.id}/image`,
      message: 'Image uploaded successfully. Processing queued in background.'
    });
  } catch (error) {
    console.error('Upload job controller error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong while queuing the media processing job.'
      }
    });
  }
}

/**
 * Retrieve user's jobs with optional pagination
 */
export async function getJobs(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      });
    }

    // Default pagination options
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [jobs, total] = await prisma.$transaction([
      prisma.job.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.job.count({
        where: { userId: req.user.id }
      })
    ]);

    const serializedJobs = jobs.map(job => serializeJob(job, req));

    return res.status(200).json({
      jobs: serializedJobs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not fetch job history.'
      }
    });
  }
}

/**
 * Retrieve a specific job's status and details
 */
export async function getJobById(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      });
    }

    const { id } = req.params;

    const job = await prisma.job.findUnique({
      where: { id }
    });

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: `Job with ID ${id} not found.`
        }
      });
    }

    // Safeguard to ensure users can only view their own jobs
    if (job.userId !== req.user.id) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this job.'
        }
      });
    }

    return res.status(200).json({ job: serializeJob(job, req) });
  } catch (error) {
    console.error('Get job details error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not fetch job details.'
      }
    });
  }
}

/**
 * Re-queue a failed processing job
 */
export async function retryJob(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      });
    }

    const { id } = req.params;

    const job = await prisma.job.findUnique({
      where: { id }
    });

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: `Job with ID ${id} not found.`
        }
      });
    }

    // Safeguard ownership
    if (job.userId !== req.user.id) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to retry this job.'
        }
      });
    }

    // Can only retry failed jobs
    if (job.status !== 'failed') {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: `Only failed jobs can be retried. Current status is: ${job.status}`
        }
      });
    }

    // Update job status back to pending, clearing errors
    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        status: 'pending',
        caption: null,
        labels: [],
        flagged: false,
        flagCategory: null,
        errorMessage: null
      }
    });

    // Re-queue the job
    await addJobToQueue(updatedJob.id, updatedJob.fileUrl);

    return res.status(200).json({
      jobId: updatedJob.id,
      status: updatedJob.status,
      message: 'Job successfully re-queued for processing.'
    });
  } catch (error) {
    console.error('Retry job error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not retry the job.'
      }
    });
  }
}

/**
 * Delete a job and its associated file
 */
export async function deleteJob(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      });
    }

    const { id } = req.params;

    const job = await prisma.job.findUnique({
      where: { id }
    });

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: `Job with ID ${id} not found.`
        }
      });
    }

    if (job.userId !== req.user.id) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this job.'
        }
      });
    }

    // Delete the file from storage
    try {
      const path = require('path');
      const filename = path.basename(job.fileUrl);
      await StorageService.deleteFile(filename);
    } catch (fileErr: any) {
      console.warn('File deletion warning (non-blocking):', fileErr.message);
    }

    // Delete the job (cascades to notifications via Prisma schema)
    await prisma.job.delete({
      where: { id }
    });

    return res.status(200).json({
      message: 'Job deleted successfully.'
    });
  } catch (error) {
    console.error('Delete job error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not delete the job.'
      }
    });
  }
}

/**
 * Get aggregated stats for the dashboard
 */
export async function getJobStats(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      });
    }

    const userId = req.user.id;

    // Get all jobs for this user (for the table)
    const allJobs = await prisma.job.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    // Compute stats
    const totalJobs = allJobs.length;
    const safeJobs = allJobs.filter(j => j.status === 'completed' && !j.flagged).length;
    const unsafeJobs = allJobs.filter(j => j.flagged).length;

    // Weekly uploads: count per local app day, not UTC day.
    const dashboardTimeZone = getDashboardTimeZone();
    const uploadCountsByDate = new Map<string, number>();

    for (const job of allJobs) {
      const dateKey = formatDateKeyInTimeZone(new Date(job.createdAt), dashboardTimeZone);
      uploadCountsByDate.set(dateKey, (uploadCountsByDate.get(dateKey) ?? 0) + 1);
    }

    const weeklyUploads = getRecentDateKeysInTimeZone(new Date(), 7, dashboardTimeZone).map(date => ({
      date,
      count: uploadCountsByDate.get(date) ?? 0
    }));

    const serializedAllJobs = allJobs.map(job => serializeJob(job, req));

    return res.status(200).json({
      totalJobs,
      safeJobs,
      unsafeJobs,
      dashboardTimeZone,
      weeklyUploads,
      allJobs: serializedAllJobs
    });
  } catch (error) {
    console.error('Get job stats error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not fetch job statistics.'
      }
    });
  }
}

/**
 * Stream job image from storage
 */
export async function getJobImage(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.'
        }
      });
    }

    const { id } = req.params;

    const job = await prisma.job.findUnique({
      where: { id }
    });

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: `Job with ID ${id} not found.`
        }
      });
    }

    // Safeguard ownership
    if (job.userId !== req.user.id) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this job\'s image.'
        }
      });
    }

    const path = require('path');
    const filename = path.basename(job.fileUrl);
    
    await StorageService.streamFile(filename, res);
  } catch (error: any) {
    console.error('Get job image error:', error);
    if (error.code === 'NoSuchKey' || error.message.includes('not found') || error.message.includes('ENOENT')) {
      return res.status(404).json({
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'The requested image file was not found in storage.'
        }
      });
    }
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not retrieve image from storage.'
      }
    });
  }
}
