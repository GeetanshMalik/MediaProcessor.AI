import dotenv from 'dotenv';
dotenv.config();

// Basic environment validation
const REQUIRED_ENV_VARS = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'HUGGINGFACE_API_KEY'];
for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar] || process.env[envVar]?.startsWith('your_') || process.env[envVar]?.includes('placeholder')) {
    console.warn(`[Worker Service] [WARNING] Environment variable "${envVar}" is missing or using a default placeholder!`);
  }
}
if (process.env.STORAGE_PROVIDER === 'r2' || process.env.STORAGE_PROVIDER === 's3') {
  const S3_VARS = ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT', 'S3_BUCKET_NAME'];
  for (const envVar of S3_VARS) {
    if (!process.env[envVar] || process.env[envVar]?.startsWith('your_') || process.env[envVar]?.includes('placeholder')) {
      console.warn(`[Worker Service] [WARNING] Storage provider is set to "${process.env.STORAGE_PROVIDER}" but S3 configuration "${envVar}" is missing or placeholder!`);
    }
  }
}

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

// Graceful shutdown handling
const handleGracefulShutdown = async (signal: string) => {
  console.log(`[Worker Service] Received ${signal}. Starting graceful shutdown...`);
  try {
    const { imageWorker } = await import('./workers/job.worker');
    await imageWorker.close();
    console.log('[Worker Service] Successfully closed BullMQ worker listener.');
  } catch (err: any) {
    console.error('[Worker Service] Error closing BullMQ worker:', err.message);
  }

  try {
    const { prisma } = await import('./database/db');
    await prisma.$disconnect();
    console.log('[Worker Service] Successfully closed database connection.');
  } catch (err: any) {
    console.error('[Worker Service] Error disconnecting Prisma:', err.message);
  }

  console.log('[Worker Service] Worker process stopped.');
  process.exit(0);
};

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

// Dummy HTTP server to satisfy Render's port binding detection in Web Services (Free Tier)
import http from 'http';
const dummyPort = process.env.PORT || 5001;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Worker is running');
}).listen(dummyPort, () => {
  console.log(`[Worker Service] Dummy server listening on port ${dummyPort} to pass Render port detection.`);
});

