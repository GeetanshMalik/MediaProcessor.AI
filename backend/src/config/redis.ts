/**
 * Redis connection configuration for BullMQ.
 * BullMQ manages its own ioredis instances internally; we provide the connection options.
 */

function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      username: parsed.username || undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const parsedConfig = parseRedisUrl(REDIS_URL);

export const connection = {
  host: parsedConfig.host,
  port: parsedConfig.port,
  password: parsedConfig.password,
  username: parsedConfig.username,
  maxRetriesPerRequest: null, // Required by BullMQ
};

export default connection;
