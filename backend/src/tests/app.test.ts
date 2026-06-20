import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../database/db';
import { hashPassword, comparePassword, generateToken, verifyToken } from '../utils/auth';
import { addJobToQueue } from '../queues/job.queue';
import {
  mergeDetectionAndVisualLabels,
  normalizeDetectionLabels,
  normalizeVisualLabels
} from '../services/ai/detection.service';
import {
  getHuggingFaceApiKey,
  getHuggingFaceApiKeys,
  readOptimizedImageForHuggingFace,
  resetHuggingFaceApiKeyRotationForTests
} from '../services/ai/ai-client';
import { toOneLineCaption } from '../services/ai/caption.service';
import { mapSafetyClassification, mapVisualSafetyReview, mergeSafetyResults } from '../services/ai/safety.service';
import { formatDateKeyInTimeZone, getRecentDateKeysInTimeZone } from '../controllers/job.controller';
import { getStaleProcessingCutoffDate, recoverInterruptedJobs } from '../workers/job-recovery';

const bullQueueAddMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'test-job-id' }));
const bullQueueGetJobMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

// Mock BullMQ Queue
vi.mock('bullmq', () => {
  return {
    Queue: vi.fn().mockImplementation(() => {
      return {
        add: bullQueueAddMock,
        getJob: bullQueueGetJobMock
      };
    })
  };
});

// Mock Prisma
vi.mock('../database/db', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        create: vi.fn()
      },
      job: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn()
      },
      notification: {
        create: vi.fn()
      }
    }
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Authentication Service', () => {
  it('should hash a password and verify it successfully', async () => {
    const password = 'my_secure_password';
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    
    const isValid = await comparePassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await comparePassword('wrong_password', hash);
    expect(isInvalid).toBe(false);
  });

  it('should sign and verify JWT tokens correctly', () => {
    const userPayload = {
      id: 'user-123',
      name: 'Alice',
      email: 'alice@example.com'
    };

    const token = generateToken(userPayload);
    expect(token).toBeTypeOf('string');

    const decoded = verifyToken(token);
    expect(decoded.id).toBe(userPayload.id);
    expect(decoded.name).toBe(userPayload.name);
    expect(decoded.email).toBe(userPayload.email);
  });
});

describe('AI Content Safety Classification', () => {
  it('should flag unsafe classifications at or above the configured threshold', () => {
    const safeResult = mapSafetyClassification([
      { label: 'normal', score: 0.96 },
      { label: 'nsfw', score: 0.04 }
    ], 0.7);

    expect(safeResult.flagged).toBe(false);
    expect(safeResult.flagCategory).toBeNull();

    const flaggedResult = mapSafetyClassification([
      { label: 'normal', score: 0.12 },
      { label: 'nsfw', score: 0.88 }
    ], 0.7);

    expect(flaggedResult.flagged).toBe(true);
    expect(flaggedResult.flagCategory).toBe('nsfw');

    const belowThresholdResult = mapSafetyClassification([
      { label: 'normal', score: 0.45 },
      { label: 'explicit', score: 0.55 }
    ], 0.7);

    expect(belowThresholdResult.flagged).toBe(false);
    expect(belowThresholdResult.flagCategory).toBeNull();
  });

  it('should flag visible abuse and harm concerns from visual safety JSON', () => {
    const result = mapVisualSafetyReview(
      '{"flagged": true, "category": "child_abuse", "confidence": 0.92}',
      0.5
    );

    expect(result.flagged).toBe(true);
    expect(result.flagCategory).toBe('child_abuse');
    expect(result.confidence).toBe(0.92);
  });

  it('should merge NSFW and visual safety results without hiding either flag', () => {
    const result = mergeSafetyResults(
      { flagged: false, flagCategory: null, confidence: 0.02 },
      { flagged: true, flagCategory: 'severe_distress', confidence: 0.82 }
    );

    expect(result.flagged).toBe(true);
    expect(result.flagCategory).toBe('severe_distress');
  });
});

describe('AI Object Detection Labels', () => {
  it('should deduplicate labels and sort them by highest confidence', () => {
    const labels = normalizeDetectionLabels([
      { label: 'dog', score: 0.88 },
      { label: 'person', score: 0.97 },
      { label: 'Dog', score: 0.92 }
    ]);

    expect(labels).toEqual(['person', 'dog']);
  });

  it('should parse visual labels and keep a maximum of three', () => {
    const labels = normalizeVisualLabels(
      '["King", "Throne", "Sword", "Jewelry", "Royal attire", "Curtain"]',
      3
    );

    expect(labels).toEqual(['king', 'throne', 'sword']);
  });

  it('should prefer visual labels over detector guesses without forcing more than three', () => {
    const labels = mergeDetectionAndVisualLabels(
      ['laptop', 'computer screen', 'table'],
      ['screenshot', 'table', 'text'],
      3
    );

    expect(labels).toEqual(['screenshot', 'table', 'text']);
  });

  it('should not create a fake fallback label when no visual label is certain', () => {
    const labels = mergeDetectionAndVisualLabels(['laptop'], [], 3);

    expect(labels).toEqual([]);
  });
});

describe('Hugging Face API Key Rotation', () => {
  beforeEach(() => {
    delete process.env.HUGGINGFACE_API_KEYS;
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.HUGGINGFACE_API_KEY_2;
    delete process.env.HUGGINGFACE_API_KEY_3;
    resetHuggingFaceApiKeyRotationForTests();
  });

  it('should rotate requests across the primary and secondary keys', () => {
    process.env.HUGGINGFACE_API_KEY = 'hf_primary';
    process.env.HUGGINGFACE_API_KEY_2 = 'hf_secondary';

    expect(getHuggingFaceApiKeys()).toEqual(['hf_primary', 'hf_secondary']);
    expect(getHuggingFaceApiKey()).toBe('hf_primary');
    expect(getHuggingFaceApiKey()).toBe('hf_secondary');
    expect(getHuggingFaceApiKey()).toBe('hf_primary');
  });

  it('should support comma-separated keys and ignore placeholders', () => {
    process.env.HUGGINGFACE_API_KEYS = 'hf_one, your_second_huggingface_api_key_optional, hf_two';
    process.env.HUGGINGFACE_API_KEY = 'hf_one';

    expect(getHuggingFaceApiKeys()).toEqual(['hf_one', 'hf_two']);
  });
});

describe('Hugging Face Image Payloads', () => {
  it('should optimize provider image payloads to JPEG before upload', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-image-'));
    const imagePath = path.join(tempDir, 'large-upload.png');
    const previousMaxEdge = process.env.HUGGINGFACE_IMAGE_MAX_EDGE;
    const previousQuality = process.env.HUGGINGFACE_IMAGE_QUALITY;
    const previousMaxBytes = process.env.HUGGINGFACE_IMAGE_MAX_BYTES;

    process.env.HUGGINGFACE_IMAGE_MAX_EDGE = '512';
    process.env.HUGGINGFACE_IMAGE_QUALITY = '80';
    process.env.HUGGINGFACE_IMAGE_MAX_BYTES = '900000';

    try {
      await sharp({
        create: {
          width: 1800,
          height: 1200,
          channels: 3,
          background: { r: 36, g: 99, b: 235 }
        }
      }).png().toFile(imagePath);

      const optimized = await readOptimizedImageForHuggingFace(imagePath);

      expect(optimized.mimeType).toBe('image/jpeg');
      expect(optimized.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
      expect(optimized.bytes).toBeLessThanOrEqual(900000);
    } finally {
      if (previousMaxEdge === undefined) {
        delete process.env.HUGGINGFACE_IMAGE_MAX_EDGE;
      } else {
        process.env.HUGGINGFACE_IMAGE_MAX_EDGE = previousMaxEdge;
      }

      if (previousQuality === undefined) {
        delete process.env.HUGGINGFACE_IMAGE_QUALITY;
      } else {
        process.env.HUGGINGFACE_IMAGE_QUALITY = previousQuality;
      }

      if (previousMaxBytes === undefined) {
        delete process.env.HUGGINGFACE_IMAGE_MAX_BYTES;
      } else {
        process.env.HUGGINGFACE_IMAGE_MAX_BYTES = previousMaxBytes;
      }

      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Hugging Face Caption Formatting', () => {
  it('should collapse model output into one sentence', () => {
    expect(toOneLineCaption('A king sits on an ornate throne holding a sword.\nHe wears jewelry and formal royal clothing.'))
      .toBe('A king sits on an ornate throne holding a sword.');
  });

  it('should keep one detailed line when punctuation is missing', () => {
    expect(toOneLineCaption('A king sits on an ornate throne\nwith jewelry and royal clothing'))
      .toBe('A king sits on an ornate throne with jewelry and royal clothing');
  });
});

describe('Queue Enqueuing', () => {
  it('should call queue add with retry configurations', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    await addJobToQueue('job-999');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Queue] Successfully enqueued Job ID: job-999'));
  });
});

describe('Worker Interrupted Job Recovery', () => {
  beforeEach(() => {
    delete process.env.JOB_STALE_PROCESSING_MINUTES;
  });

  it('should calculate stale processing cutoff from env minutes', () => {
    process.env.JOB_STALE_PROCESSING_MINUTES = '10';
    const now = new Date('2026-06-20T01:00:00.000Z');

    expect(getStaleProcessingCutoffDate(now).toISOString()).toBe('2026-06-20T00:50:00.000Z');
  });

  it('should requeue pending jobs and reset stale processing jobs to pending', async () => {
    const jobFindManyMock = prisma.job.findMany as unknown as ReturnType<typeof vi.fn>;
    const jobUpdateMock = prisma.job.update as unknown as ReturnType<typeof vi.fn>;

    jobFindManyMock.mockResolvedValue([
      { id: 'pending-job', status: 'pending', fileUrl: 'http://example.com/pending.jpg', updatedAt: new Date('2026-06-20T00:59:00.000Z') },
      { id: 'stale-processing-job', status: 'processing', fileUrl: 'http://example.com/stale.jpg', updatedAt: new Date('2026-06-20T00:40:00.000Z') }
    ]);
    jobUpdateMock.mockResolvedValue({});

    const result = await recoverInterruptedJobs(new Date('2026-06-20T01:00:00.000Z'));

    expect(result.recoveredCount).toBe(2);
    expect(jobFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { status: 'pending' },
          {
            status: 'processing',
            updatedAt: {
              lt: new Date('2026-06-20T00:45:00.000Z')
            }
          }
        ]
      }
    }));
    expect(jobUpdateMock).toHaveBeenCalledWith({
      where: { id: 'stale-processing-job' },
      data: {
        status: 'pending',
        errorMessage: null
      }
    });
    expect(bullQueueAddMock).toHaveBeenCalledTimes(2);
    expect(bullQueueAddMock).toHaveBeenNthCalledWith(
      1,
      'process-image',
      { jobId: 'pending-job', imageReference: 'http://example.com/pending.jpg' },
      expect.objectContaining({ jobId: 'pending-job' })
    );
    expect(bullQueueAddMock).toHaveBeenNthCalledWith(
      2,
      'process-image',
      { jobId: 'stale-processing-job', imageReference: 'http://example.com/stale.jpg' },
      expect.objectContaining({ jobId: 'stale-processing-job' })
    );
  });
});

describe('Dashboard Date Bucketing', () => {
  it('should bucket uploads by India local date after midnight instead of UTC date', () => {
    const uploadedAt = new Date('2026-06-19T19:00:00.000Z'); // 2026-06-20 00:30 in Asia/Kolkata

    expect(formatDateKeyInTimeZone(uploadedAt, 'Asia/Kolkata')).toBe('2026-06-20');
  });

  it('should make the current local day the last point in the weekly graph', () => {
    const now = new Date('2026-06-19T19:30:00.000Z'); // 2026-06-20 01:00 in Asia/Kolkata
    const dateKeys = getRecentDateKeysInTimeZone(now, 7, 'Asia/Kolkata');

    expect(dateKeys).toHaveLength(7);
    expect(dateKeys[dateKeys.length - 1]).toBe('2026-06-20');
    expect(dateKeys[dateKeys.length - 2]).toBe('2026-06-19');
  });
});
