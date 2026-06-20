import {
  postHuggingFaceChatCompletion,
  postHuggingFaceModel,
  readOptimizedImageAsBase64,
  readOptimizedImageAsDataUrl
} from './ai-client';

const DEFAULT_DETECTION_MODEL = 'facebook/detr-resnet-50';
const DEFAULT_DETECTION_THRESHOLD = 0.5;
const DEFAULT_LABEL_MODEL = 'meta-llama/Llama-4-Scout-17B-16E-Instruct:groq';
const DEFAULT_LABEL_MAX_COUNT = 6;

export interface ObjectDetectionResult {
  label: string;
  score: number;
  box?: {
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
  };
}

export interface DetectionSummary {
  labels: string[];
  detections: ObjectDetectionResult[];
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function getDetectionModel() {
  return process.env.HUGGINGFACE_DETECTION_MODEL?.trim() || DEFAULT_DETECTION_MODEL;
}

function getDetectionThreshold() {
  const configuredThreshold = Number(process.env.HUGGINGFACE_DETECTION_THRESHOLD);
  return Number.isFinite(configuredThreshold) && configuredThreshold >= 0 && configuredThreshold <= 1
    ? configuredThreshold
    : DEFAULT_DETECTION_THRESHOLD;
}

function getLabelModel() {
  return (
    process.env.HUGGINGFACE_LABEL_MODEL?.trim() ||
    process.env.HUGGINGFACE_CAPTION_MODEL?.trim() ||
    DEFAULT_LABEL_MODEL
  );
}

function getLabelMaxCount() {
  const configuredMaxCount = Number(process.env.HUGGINGFACE_LABEL_MAX_COUNT);
  return Number.isFinite(configuredMaxCount) && configuredMaxCount > 0
    ? Math.min(Math.floor(configuredMaxCount), DEFAULT_LABEL_MAX_COUNT)
    : DEFAULT_LABEL_MAX_COUNT;
}

function cleanLabel(label: string) {
  return label
    .trim()
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/^[`"'[\]{},:]+|[`"'[\]{},:.]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeDetectionLabels(detections: ObjectDetectionResult[]) {
  const labelsByScore = new Map<string, number>();

  for (const detection of detections) {
    if (!detection.label) {
      continue;
    }

    const label = cleanLabel(detection.label);
    const currentScore = labelsByScore.get(label) ?? 0;
    labelsByScore.set(label, Math.max(currentScore, detection.score ?? 0));
  }

  return Array.from(labelsByScore.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label);
}

function extractMessageContent(response: ChatCompletionResponse) {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map(part => part.text)
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  return '';
}

function stripMarkdownFence(content: string) {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseLabelContent(content: string): string[] {
  const stripped = stripMarkdownFence(content);

  try {
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) {
      return parsed.map(String);
    }

    if (Array.isArray(parsed?.labels)) {
      return parsed.labels.map(String);
    }
  } catch {
    // Fall through to plain-text parsing; providers sometimes ignore JSON-only prompts.
  }

  return stripped
    .replace(/^labels?\s*:\s*/i, '')
    .split(/[\n,;|]+/)
    .map(label => label.replace(/^labels?\s*:\s*/i, ''));
}

export function normalizeVisualLabels(content: string, maxCount = DEFAULT_LABEL_MAX_COUNT) {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const rawLabel of parseLabelContent(content)) {
    const label = cleanLabel(rawLabel);
    if (!label || seen.has(label)) {
      continue;
    }

    labels.push(label);
    seen.add(label);

    if (labels.length >= maxCount) {
      break;
    }
  }

  return labels;
}

export function mergeDetectionAndVisualLabels(
  detectionLabels: string[],
  visualLabels: string[],
  maxCount = DEFAULT_LABEL_MAX_COUNT
) {
  const labels: string[] = [];
  const seen = new Set<string>();
  const sourceLabels = visualLabels.length > 0 ? visualLabels : [];

  for (const rawLabel of sourceLabels) {
    const label = cleanLabel(rawLabel);
    if (!label || seen.has(label)) {
      continue;
    }

    labels.push(label);
    seen.add(label);

    if (labels.length >= maxCount) {
      break;
    }
  }

  return labels;
}

async function generateVisualLabels(localFilePath: string, detectionLabels: string[]) {
  const maxCount = getLabelMaxCount();
  const detectorNote = detectionLabels.length > 0
    ? 'Ignore object-detector guesses unless the item is clearly visible in the pixels. '
    : '';

  const response = await postHuggingFaceChatCompletion<ChatCompletionResponse>(
    {
      model: getLabelModel(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Return 1 to ${maxCount} concise lowercase labels representing the most important main subjects, actions, and key context of this image. ` +
                'Follow this prioritization logic when choosing labels: ' +
                '1. Prioritize the main subject and action over minor background details. Do NOT output trivial details like clothing items (e.g. "jeans", "shirt", "shoes") unless they are the primary subject of the image. ' +
                '2. Check if there are living beings (humans, animals, birds, etc.). If so, label what they are doing (e.g., "fighting", "running", "playing", "crying", "eating", "threatening"). ' +
                '3. Identify any specific important objects (e.g. "sword", "weapon", "food", "vehicle", "tool", "logo"). ' +
                '4. If humans are present, capture their apparent status, state or look if it is significant (e.g., "royal", "poor", "rich", "distressed", "normal"). ' +
                '5. Avoid inferring hidden/invisible context. All labels must be directly visible in the image pixels. ' +
                detectorNote +
                'Return only a JSON array of strings, with no explanation.'
            },
            { type: 'image_url', image_url: { url: await readOptimizedImageAsDataUrl(localFilePath) } }
          ]
        }
      ],
      max_tokens: 80,
      stream: false
    },
    {
      providerName: 'Hugging Face Visual Labeling',
      timeoutMs: 60000
    }
  );

  const content = extractMessageContent(response);
  if (!content) {
    throw new Error('Invalid response structure from Hugging Face visual labeling.');
  }

  return normalizeVisualLabels(content, maxCount);
}

export async function detectObjects(localFilePath: string): Promise<DetectionSummary> {
  const model = getDetectionModel();
  const threshold = getDetectionThreshold();
  const maxCount = getLabelMaxCount();

  try {
    const detections = await postHuggingFaceModel<ObjectDetectionResult[]>(
      model,
      {
        inputs: await readOptimizedImageAsBase64(localFilePath),
        parameters: {
          threshold
        }
      },
      {
        providerName: 'Hugging Face Object Detection',
        timeoutMs: 45000
      }
    );

    if (!Array.isArray(detections)) {
      throw new Error('Invalid response structure from Hugging Face object detection.');
    }

    const detectionLabels = normalizeDetectionLabels(detections);
    const visualLabels = await generateVisualLabels(localFilePath, detectionLabels);
    const persistedLabels = mergeDetectionAndVisualLabels(detectionLabels, visualLabels, maxCount);

    console.log(`[AI Service] Objects detected: [${persistedLabels.join(', ')}]`);

    return {
      labels: persistedLabels,
      detections
    };
  } catch (error: any) {
    console.error('[AI Service] Hugging Face object detection failed:', error.message);
    throw new Error(`Hugging Face Object Detection failed: ${error.message}`);
  }
}
