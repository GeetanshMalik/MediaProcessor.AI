import axios from 'axios';

// Fallback to local server URL for development, configurable via Vite environment variables
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Automatically inject JWT token into all requests if it exists in localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Keep-alive ping to prevent Render free-tier cold starts.
 * Pings GET /health every 4 minutes. The endpoint is lightweight and returns { status: 'ok' }.
 * Only runs in production to avoid noise during local development.
 */
if (import.meta.env.PROD) {
  setInterval(() => {
    api.get('/health').catch(() => {
      // Silently ignore — this is a background keep-alive, not user-facing
    });
  }, 4 * 60 * 1000); // Every 4 minutes
}

export default api;
