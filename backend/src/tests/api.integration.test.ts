import fs from 'fs/promises';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import { generateToken, hashPassword } from '../utils/auth';

const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/testdb';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  process.env.JWT_SECRET = 'integration_test_secret';
  process.env.HUGGINGFACE_API_KEY = 'hf_integration_test';
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIR = 'test-uploads';

  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    job: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn()
    },
    notification: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn()
    },
    $transaction: vi.fn(),
    $disconnect: vi.fn()
  };

  const storageService = {
    uploadFile: vi.fn(),
    streamFile: vi.fn(),
    deleteFile: vi.fn()
  };

  return {
    prisma,
    storageService,
    addJobToQueue: vi.fn()
  };
});

vi.mock('../database/db', () => ({
  prisma: mocks.prisma,
  default: mocks.prisma
}));

vi.mock('../services/storage.service', () => ({
  StorageService: mocks.storageService,
  default: mocks.storageService
}));

vi.mock('../queues/job.queue', () => ({
  addJobToQueue: mocks.addJobToQueue,
  default: mocks.addJobToQueue
}));

function authToken(userId = 'user-1') {
  return generateToken({
    id: userId,
    name: 'Test User',
    email: `${userId}@example.com`
  });
}

describe('API requirement integration coverage', () => {
  let app: Express;

  beforeAll(async () => {
    await fs.mkdir('test-uploads', { recursive: true });
    app = (await import('../api')).app;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageService.uploadFile.mockResolvedValue('https://storage.example.com/upload.jpg');
    mocks.storageService.streamFile.mockImplementation((_filename: string, res: any) => {
      res.setHeader('Content-Type', 'image/jpeg');
      res.end('mock-image');
      return Promise.resolve();
    });
    mocks.addJobToQueue.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await fs.rm('test-uploads', { recursive: true, force: true });
  });

  describe('authentication', () => {
    it('registers a user and returns a JWT', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null);
      mocks.prisma.user.create.mockResolvedValue({
        id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com'
      });

      const response = await request(app)
        .post('/auth/register')
        .send({ name: 'Ada Lovelace', email: 'ADA@example.com', password: 'secret123' })
        .expect(201);

      expect(response.body.token).toEqual(expect.any(String));
      expect(response.body.user).toEqual({
        id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com'
      });
      expect(mocks.prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          passwordHash: expect.any(String)
        })
      });
    });

    it('logs in with valid credentials and rejects unauthenticated profile requests', async () => {
      const passwordHash = await hashPassword('secret123');
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        passwordHash
      });

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: 'ada@example.com', password: 'secret123' })
        .expect(200);

      expect(loginResponse.body.token).toEqual(expect.any(String));

      await request(app).get('/auth/me').expect(401);

      const meResponse = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200);

      expect(meResponse.body.user.id).toBe('user-1');
    });
  });

  describe('upload endpoint validation and queueing', () => {
    it('rejects unauthenticated uploads before accepting a file', async () => {
      const response = await request(app)
        .post('/jobs/upload')
        .attach('image', Buffer.from('fake'), { filename: 'image.jpg', contentType: 'image/jpeg' })
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(mocks.storageService.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects unsupported file types with a clear error', async () => {
      const response = await request(app)
        .post('/jobs/upload')
        .set('Authorization', `Bearer ${authToken()}`)
        .attach('image', Buffer.from('not an image'), { filename: 'document.txt', contentType: 'text/plain' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_FILE_TYPE');
      expect(response.body.error.message).toContain('Only JPG, PNG, and WEBP');
    });

    it('enforces the 5 MB API upload limit', async () => {
      const response = await request(app)
        .post('/jobs/upload')
        .set('Authorization', `Bearer ${authToken()}`)
        .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'large.jpg', contentType: 'image/jpeg' })
        .expect(400);

      expect(response.body.error.code).toBe('FILE_TOO_LARGE');
    });

    it('stores the image, creates a pending job, enqueues it, and returns immediately', async () => {
      mocks.prisma.job.create.mockResolvedValue({
        id: 'job-1',
        userId: 'user-1',
        fileUrl: 'https://storage.example.com/upload.jpg',
        status: 'pending'
      });

      const response = await request(app)
        .post('/jobs/upload')
        .set('Authorization', `Bearer ${authToken('user-1')}`)
        .attach('image', Buffer.from('fake jpeg bytes'), { filename: 'upload.jpg', contentType: 'image/jpeg' })
        .expect(201);

      expect(response.body).toEqual(expect.objectContaining({
        jobId: 'job-1',
        status: 'pending',
        message: expect.stringContaining('queued')
      }));
      expect(mocks.storageService.uploadFile).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/), expect.any(String));
      expect(mocks.prisma.job.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          fileUrl: 'https://storage.example.com/upload.jpg',
          status: 'pending'
        }
      });
      expect(mocks.addJobToQueue).toHaveBeenCalledWith('job-1', 'https://storage.example.com/upload.jpg');
    });
  });

  describe('job retry and ownership authorization', () => {
    it('requeues a failed job owned by the authenticated user', async () => {
      mocks.prisma.job.findUnique.mockResolvedValue({
        id: 'job-1',
        userId: 'user-1',
        fileUrl: 'https://storage.example.com/upload.jpg',
        status: 'failed'
      });
      mocks.prisma.job.update.mockResolvedValue({
        id: 'job-1',
        userId: 'user-1',
        fileUrl: 'https://storage.example.com/upload.jpg',
        status: 'pending'
      });

      const response = await request(app)
        .post('/jobs/job-1/retry')
        .set('Authorization', `Bearer ${authToken('user-1')}`)
        .expect(200);

      expect(response.body.status).toBe('pending');
      expect(mocks.prisma.job.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: 'pending',
          caption: null,
          flagged: false,
          flagCategory: null,
          errorMessage: null
        })
      });
      expect(mocks.addJobToQueue).toHaveBeenCalledWith('job-1', 'https://storage.example.com/upload.jpg');
    });

    it('rejects retry for non-failed jobs', async () => {
      mocks.prisma.job.findUnique.mockResolvedValue({
        id: 'job-1',
        userId: 'user-1',
        fileUrl: 'https://storage.example.com/upload.jpg',
        status: 'processing'
      });

      const response = await request(app)
        .post('/jobs/job-1/retry')
        .set('Authorization', `Bearer ${authToken('user-1')}`)
        .expect(400);

      expect(response.body.error.code).toBe('BAD_REQUEST');
      expect(mocks.addJobToQueue).not.toHaveBeenCalled();
    });

    it('blocks access to another user job and image', async () => {
      mocks.prisma.job.findUnique.mockResolvedValue({
        id: 'job-2',
        userId: 'other-user',
        fileUrl: 'https://storage.example.com/other.jpg',
        status: 'completed'
      });

      await request(app)
        .get('/jobs/job-2')
        .set('Authorization', `Bearer ${authToken('user-1')}`)
        .expect(403);

      await request(app)
        .get('/jobs/job-2/image')
        .set('Authorization', `Bearer ${authToken('user-1')}`)
        .expect(403);

      expect(mocks.storageService.streamFile).not.toHaveBeenCalled();
    });
  });

  describe('notifications', () => {
    it('returns only notifications for the authenticated user', async () => {
      mocks.prisma.notification.findMany.mockResolvedValue([
        { id: 'notification-1', userId: 'user-1', jobId: 'job-1', message: 'Done', isRead: false }
      ]);

      const response = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${authToken('user-1')}`)
        .expect(200);

      expect(response.body.notifications).toHaveLength(1);
      expect(mocks.prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' }
      });
    });

    it('prevents marking another user notification as read', async () => {
      mocks.prisma.notification.findUnique.mockResolvedValue({
        id: 'notification-2',
        userId: 'other-user',
        jobId: 'job-2',
        message: 'Flagged',
        isRead: false
      });

      const response = await request(app)
        .patch('/notifications/notification-2/read')
        .set('Authorization', `Bearer ${authToken('user-1')}`)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(mocks.prisma.notification.update).not.toHaveBeenCalled();
    });

    it('marks all unread notifications for the authenticated user only', async () => {
      mocks.prisma.notification.updateMany.mockResolvedValue({ count: 2 });

      await request(app)
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${authToken('user-1')}`)
        .expect(200);

      expect(mocks.prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          isRead: false
        },
        data: { isRead: true }
      });
    });
  });
});
