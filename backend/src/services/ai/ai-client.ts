import axios, { AxiosRequestConfig } from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const DEFAULT_HUGGINGFACE_INFERENCE_BASE_URL = 'https://router.huggingface.co/hf-inference/models';
const DEFAULT_HUGGINGFACE_CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';
const DEFAULT_REQUEST_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_IMAGE_MAX_EDGE = 768;
const DEFAULT_IMAGE_QUALITY = 78;
const DEFAULT_IMAGE_MAX_BYTES = 900_000;

const retryableStatusCodes = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const retryableErrorCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN']);
let huggingFaceApiKeyCursor = 0;

export interface HuggingFaceRequestOptions {
  providerName: string;
  timeoutMs?: number;
  retries?: number;
}

function splitApiKeys(value?: string) {
  return (value || '')
    .split(',')
    .map(key => key.trim())
    .filter(Boolean);
}

function isConfiguredApiKey(key: string) {
  return Boolean(key) && !key.startsWith('your_');
}

export function getHuggingFaceApiKeys(): string[] {
  const configuredKeys = [
    ...splitApiKeys(process.env.HUGGINGFACE_API_KEYS),
    process.env.HUGGINGFACE_API_KEY?.trim() || '',
    ...Object.entries(process.env)
      .filter(([name]) => /^HUGGINGFACE_API_KEY_\d+$/.test(name))
      .sort(([left], [right]) => Number(left.split('_').pop()) - Number(right.split('_').pop()))
      .map(([, value]) => value?.trim() || '')
  ].filter(isConfiguredApiKey);

  const uniqueKeys = Array.from(new Set(configuredKeys));

  if (uniqueKeys.length === 0) {
    throw new Error('Hugging Face API key is not configured. Set HUGGINGFACE_API_KEY, HUGGINGFACE_API_KEY_2, or HUGGINGFACE_API_KEYS.');
  }

  return uniqueKeys;
}

export function resetHuggingFaceApiKeyRotationForTests() {
  huggingFaceApiKeyCursor = 0;
}

export function getHuggingFaceApiKey(): string {
  const apiKeys = getHuggingFaceApiKeys();
  const apiKey = apiKeys[huggingFaceApiKeyCursor % apiKeys.length];
  huggingFaceApiKeyCursor = (huggingFaceApiKeyCursor + 1) % Number.MAX_SAFE_INTEGER;
  return apiKey;
}

export function getImageMimeType(localFilePath: string) {
  const extension = path.extname(localFilePath).toLowerCase();

  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

export function readImageAsBase64(localFilePath: string) {
  return fs.readFileSync(localFilePath).toString('base64');
}

export function readImageAsDataUrl(localFilePath: string) {
  const mimeType = getImageMimeType(localFilePath);
  return `data:${mimeType};base64,${readImageAsBase64(localFilePath)}`;
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const configuredValue = Number(process.env[name]);
  return Number.isFinite(configuredValue) && configuredValue > 0
    ? Math.floor(configuredValue)
    : fallback;
}

function getOptimizedImageConfig() {
  return {
    maxEdge: getPositiveIntegerEnv('HUGGINGFACE_IMAGE_MAX_EDGE', DEFAULT_IMAGE_MAX_EDGE),
    quality: Math.min(getPositiveIntegerEnv('HUGGINGFACE_IMAGE_QUALITY', DEFAULT_IMAGE_QUALITY), 95),
    maxBytes: getPositiveIntegerEnv('HUGGINGFACE_IMAGE_MAX_BYTES', DEFAULT_IMAGE_MAX_BYTES)
  };
}

async function renderOptimizedJpeg(localFilePath: string, maxEdge: number, quality: number) {
  return sharp(localFilePath, { animated: false })
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({
      quality,
      mozjpeg: true
    })
    .toBuffer();
}

export async function readOptimizedImageForHuggingFace(localFilePath: string) {
  const { maxBytes, maxEdge, quality } = getOptimizedImageConfig();
  let currentMaxEdge = maxEdge;
  let currentQuality = quality;
  let optimized = await renderOptimizedJpeg(localFilePath, currentMaxEdge, currentQuality);

  while (optimized.length > maxBytes && (currentMaxEdge > 384 || currentQuality > 50)) {
    if (currentQuality > 50) {
      currentQuality = Math.max(50, currentQuality - 10);
    } else {
      currentMaxEdge = Math.max(384, Math.floor(currentMaxEdge * 0.8));
      currentQuality = quality;
    }

    optimized = await renderOptimizedJpeg(localFilePath, currentMaxEdge, currentQuality);
  }

  if (optimized.length > maxBytes) {
    console.warn(
      `[AI Service] Optimized image is ${optimized.length} bytes, above target ${maxBytes} bytes; sending smallest generated payload.`
    );
  }

  const base64 = optimized.toString('base64');

  return {
    base64,
    dataUrl: `data:image/jpeg;base64,${base64}`,
    mimeType: 'image/jpeg',
    bytes: optimized.length
  };
}

export async function readOptimizedImageAsBase64(localFilePath: string) {
  return (await readOptimizedImageForHuggingFace(localFilePath)).base64;
}

export async function readOptimizedImageAsDataUrl(localFilePath: string) {
  return (await readOptimizedImageForHuggingFace(localFilePath)).dataUrl;
}

export function getHuggingFaceInferenceBaseUrl() {
  return (
    process.env.HUGGINGFACE_INFERENCE_BASE_URL?.trim() ||
    DEFAULT_HUGGINGFACE_INFERENCE_BASE_URL
  ).replace(/\/$/, '');
}

export function getHuggingFaceChatUrl() {
  return process.env.HUGGINGFACE_CHAT_URL?.trim() || DEFAULT_HUGGINGFACE_CHAT_URL;
}

function modelPath(model: string) {
  return model
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function getRetryCount(options: HuggingFaceRequestOptions) {
  const configuredRetries = Number(process.env.HUGGINGFACE_REQUEST_RETRIES);
  const fallbackRetries = Number.isFinite(configuredRetries) ? configuredRetries : DEFAULT_REQUEST_RETRIES;
  return Math.max(0, options.retries ?? fallbackRetries);
}

function getRetryDelayMs(attempt: number) {
  const configuredDelay = Number(process.env.HUGGINGFACE_RETRY_DELAY_MS);
  const baseDelay = Number.isFinite(configuredDelay) ? configuredDelay : DEFAULT_RETRY_DELAY_MS;
  return Math.max(0, baseDelay * attempt);
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractProviderMessage(data: any): string | null {
  if (!data) {
    return null;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (typeof data.error === 'string') {
    return data.error;
  }

  if (data.error && typeof data.error === 'object') {
    const message = data.error.message || data.error.status || data.error.type;
    if (message) {
      return message;
    }
  }

  if (typeof data.message === 'string') {
    return data.message;
  }

  return null;
}

function shouldRetry(error: any) {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  if (error.response?.status) {
    return retryableStatusCodes.has(error.response.status);
  }

  if (error.code) {
    return retryableErrorCodes.has(error.code);
  }

  return false;
}

function formatAxiosError(error: any, provider: string, fallbackHost: string) {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      const requestUrl = error.config?.url;
      const host = requestUrl ? new URL(requestUrl).hostname : fallbackHost;
      return `DNS lookup failed for ${host}. Check Docker DNS or network access.`;
    }

    if (error.response) {
      const message = extractProviderMessage(error.response.data) || error.response.statusText || 'Request failed';
      return `${provider} returned HTTP ${error.response.status}: ${message}`;
    }
  }

  return error.message || `${provider} request failed.`;
}

async function requestWithRetry<T>(config: AxiosRequestConfig, options: HuggingFaceRequestOptions): Promise<T> {
  const retries = getRetryCount(options);
  const requestUrl = config.url ? new URL(config.url) : new URL(getHuggingFaceInferenceBaseUrl());
  let lastError: any;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const response = await axios.request<T>({
        ...config,
        headers: {
          Authorization: `Bearer ${getHuggingFaceApiKey()}`,
          'Content-Type': 'application/json',
          ...config.headers
        },
        timeout: options.timeoutMs ?? config.timeout ?? 45000
      });

      return response.data;
    } catch (error: any) {
      lastError = error;

      if (attempt > retries || !shouldRetry(error)) {
        break;
      }

      await delay(getRetryDelayMs(attempt));
    }
  }

  throw new Error(formatAxiosError(lastError, options.providerName, requestUrl.hostname));
}

export async function postHuggingFaceModel<T>(
  model: string,
  payload: Record<string, unknown>,
  options: HuggingFaceRequestOptions
): Promise<T> {
  const url = `${getHuggingFaceInferenceBaseUrl()}/${modelPath(model)}`;
  return requestWithRetry<T>(
    {
      method: 'POST',
      url,
      data: payload
    },
    options
  );
}

export async function postHuggingFaceChatCompletion<T>(
  payload: Record<string, unknown>,
  options: HuggingFaceRequestOptions
): Promise<T> {
  return requestWithRetry<T>(
    {
      method: 'POST',
      url: getHuggingFaceChatUrl(),
      data: payload
    },
    options
  );
}
