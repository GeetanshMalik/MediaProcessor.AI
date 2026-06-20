import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import jobRoutes from './routes/job.routes';
import notificationRoutes from './routes/notification.routes';

import path from 'path';

dotenv.config();

const app = express();
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

// Conditionally run the background worker listener inside the API process (useful for free tier hosting like Render)
if (process.env.RUN_WORKER === 'true') {
  console.log('[API Server] RUN_WORKER is set to true. Initializing background worker inside API process...');
  import('./workers/job.worker')
    .then(() => {
      console.log('[API Server] Worker listener initialized successfully.');
      return import('./workers/job-recovery');
    })
    .then(({ recoverInterruptedJobs }) => {
      return recoverInterruptedJobs();
    })
    .then(({ recoveredCount }) => {
      if (recoveredCount > 0) {
        console.log(`[API Server] Re-queued ${recoveredCount} pending or interrupted processing job(s).`);
      }
    })
    .catch((error) => {
      console.error('[API Server] Failed to initialize worker or recover jobs:', error);
    });
}

app.listen(PORT, () => {
  console.log(`[API Server] Running on port ${PORT}`);
});
