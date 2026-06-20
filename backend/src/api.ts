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

app.listen(PORT, () => {
  console.log(`[API Server] Running on port ${PORT}`);
});
