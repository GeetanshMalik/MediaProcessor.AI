import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import jobRoutes from './routes/job.routes';
import notificationRoutes from './routes/notification.routes';

import path from 'path';

dotenv.config();

// Basic environment validation
const REQUIRED_ENV_VARS = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'HUGGINGFACE_API_KEY'];
for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar] || process.env[envVar]?.startsWith('your_') || process.env[envVar]?.includes('placeholder')) {
    console.warn(`[API Server] [WARNING] Environment variable "${envVar}" is missing or using a default placeholder!`);
  }
}
if (process.env.STORAGE_PROVIDER === 'r2' || process.env.STORAGE_PROVIDER === 's3') {
  const S3_VARS = ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT', 'S3_BUCKET_NAME'];
  for (const envVar of S3_VARS) {
    if (!process.env[envVar] || process.env[envVar]?.startsWith('your_') || process.env[envVar]?.includes('placeholder')) {
      console.warn(`[API Server] [WARNING] Storage provider is set to "${process.env.STORAGE_PROVIDER}" but S3 configuration "${envVar}" is missing or placeholder!`);
    }
  }
}

export const app = express();
const PORT = process.env.PORT || 5000;

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(o => o.trim()),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serving uploaded files locally
app.use('/uploads', express.static(process.env.UPLOAD_DIR || 'uploads'));

// Routes
app.use('/auth', authRoutes);
app.use('/jobs', jobRoutes);
app.use('/notifications', notificationRoutes);

// Serve OpenAPI Specification
app.get('/api-docs/openapi.json', (req, res) => {
  res.sendFile(path.join(__dirname, '../openapi.json'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api' });
});

export function startApiServer() {
  const server = app.listen(PORT, () => {
    console.log(`[API Server] Running on port ${PORT}`);
  });

  // Graceful shutdown handling
  const handleGracefulShutdown = (signal: string) => {
    console.log(`[API Server] Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      try {
        const { prisma } = await import('./database/db');
        await prisma.$disconnect();
        console.log('[API Server] Successfully closed database connection.');
      } catch (err: any) {
        console.error('[API Server] Error disconnecting Prisma:', err.message);
      }
      console.log('[API Server] Server process stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  startApiServer();
}

export default app;
