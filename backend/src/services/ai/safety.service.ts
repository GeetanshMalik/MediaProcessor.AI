import {
  postHuggingFaceChatCompletion,
  postHuggingFaceModel,
  readOptimizedImageAsBase64,
  readOptimizedImageAsDataUrl
} from './ai-client';

const DEFAULT_SAFETY_MODEL = 'Falconsai/nsfw_image_detection';
const DEFAULT_VISUAL_SAFETY_MODEL = 'meta-llama/Llama-4-Scout-17B-16E-Instruct:groq';
const DEFAULT_SAFETY_THRESHOLD = 0.7;
const DEFAULT_VISUAL_SAFETY_THRESHOLD = 0.5;
const UNSAFE_LABEL_MARKERS = ['nsfw', 'unsafe', 'explicit', 'adult', 'porn', 'sexual', 'hentai'];
const SAFE_CATEGORIES = new Set(['', 'none', 'safe']);

export interface SafetyClassification {
  label: string;
  score: number;
}

export interface SafetyResult {
  flagged: boolean;
  flagCategory: string | null;
  confidence: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function getSafetyModel() {
  return process.env.HUGGINGFACE_SAFETY_MODEL?.trim() || DEFAULT_SAFETY_MODEL;
}

function getVisualSafetyModel() {
  return (
    process.env.HUGGINGFACE_SAFETY_REVIEW_MODEL?.trim() ||
    process.env.HUGGINGFACE_LABEL_MODEL?.trim() ||
    process.env.HUGGINGFACE_CAPTION_MODEL?.trim() ||
    DEFAULT_VISUAL_SAFETY_MODEL
  );
}

export function getSafetyThreshold() {
  const configuredThreshold = Number(process.env.HUGGINGFACE_SAFETY_THRESHOLD);
  return Number.isFinite(configuredThreshold) && configuredThreshold >= 0 && configuredThreshold <= 1
    ? configuredThreshold
    : DEFAULT_SAFETY_THRESHOLD;
}

export function getVisualSafetyThreshold() {
  const configuredThreshold = Number(process.env.HUGGINGFACE_SAFETY_REVIEW_THRESHOLD);
  return Number.isFinite(configuredThreshold) && configuredThreshold >= 0 && configuredThreshold <= 1
    ? configuredThreshold
    : DEFAULT_VISUAL_SAFETY_THRESHOLD;
}

function normalizeCategory(label: string) {
  return label.trim().replace(/\s+/g, '_').toLowerCase();
}

function isUnsafeLabel(label: string) {
  const normalizedLabel = normalizeCategory(label);
  return UNSAFE_LABEL_MARKERS.some(marker => normalizedLabel.includes(marker));
}

function clampConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) {
    return 0;
  }

  return Math.max(0, Math.min(confidence, 1));
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

export function mapSafetyClassification(
  classifications: SafetyClassification[],
  threshold = DEFAULT_SAFETY_THRESHOLD
): SafetyResult {
  const unsafePrediction = classifications
    .filter(classification => classification.label && isUnsafeLabel(classification.label))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  if (!unsafePrediction || unsafePrediction.score < threshold) {
    return {
      flagged: false,
      flagCategory: null,
      confidence: unsafePrediction?.score ?? 0
    };
  }

  return {
    flagged: true,
    flagCategory: normalizeCategory(unsafePrediction.label),
    confidence: unsafePrediction.score
  };
}

export function mapVisualSafetyReview(content: string, threshold = DEFAULT_VISUAL_SAFETY_THRESHOLD): SafetyResult {
  let parsed: any;

  try {
    parsed = JSON.parse(stripMarkdownFence(content));
  } catch {
    throw new Error('Invalid JSON response from Hugging Face visual safety review.');
  }

  const category = normalizeCategory(String(parsed.category || 'none'));
  const hasNumericConfidence = Number.isFinite(Number(parsed.confidence));
  const confidence = hasNumericConfidence ? clampConfidence(parsed.confidence) : 0;
  const modelFlagged = parsed.flagged === true || parsed.flagged === 'true';
  const unsafeCategory = !SAFE_CATEGORIES.has(category);
  const flagged = unsafeCategory && (modelFlagged || confidence >= threshold);

  return {
    flagged,
    flagCategory: flagged ? category : null,
    confidence: hasNumericConfidence ? confidence : modelFlagged ? 1 : 0
  };
}

export function mergeSafetyResults(...results: SafetyResult[]): SafetyResult {
  const flaggedResults = results
    .filter(result => result.flagged)
    .sort((a, b) => b.confidence - a.confidence);

  if (flaggedResults.length > 0) {
    return flaggedResults[0];
  }

  const highestSafeConfidence = results.reduce(
    (highest, result) => Math.max(highest, result.confidence),
    0
  );

  return {
    flagged: false,
    flagCategory: null,
    confidence: highestSafeConfidence
  };
}

async function reviewVisualSafety(localFilePath: string): Promise<SafetyResult> {
  const response = await postHuggingFaceChatCompletion<ChatCompletionResponse>(
    {
      model: getVisualSafetyModel(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Review this image for visible content-safety risk. ' +
                'Flag only from visible evidence in the pixels, but include non-sexual harm risks that NSFW classifiers miss. ' +
                'Flag images showing or strongly indicating abuse, assault, coercion, violence, injury, self-harm, severe distress, exploitation, or child/minor harm. ' +
                'If a child or young person appears harmed, threatened, cowering, crying, hiding, or in an abuse context, flag it even when there is no nudity. ' +
                'If the image is just an ordinary person, document, object, or scene without visible harm risk, mark it safe. ' +
                'Return only JSON exactly like {"flagged":true,"category":"child_abuse","confidence":0.92}. ' +
                'Allowed unsafe categories: child_abuse, abuse_or_violence, self_harm, severe_distress, sexual_content, explicit_nudity, bullying, harassment, weapons, hate_speech, drugs_or_illegal_substances, unsafe. ' +
                'Use category "none" when safe.'
            },
            { type: 'image_url', image_url: { url: await readOptimizedImageAsDataUrl(localFilePath) } }
          ]
        }
      ],
      max_tokens: 80,
      stream: false
    },
    {
      providerName: 'Hugging Face Visual Safety Review',
      timeoutMs: 60000
    }
  );

  const content = extractMessageContent(response);
  if (!content) {
    throw new Error('Invalid response structure from Hugging Face visual safety review.');
  }

  return mapVisualSafetyReview(content, getVisualSafetyThreshold());
}

export async function classifySafety(localFilePath: string): Promise<SafetyResult> {
  const model = getSafetyModel();
  const threshold = getSafetyThreshold();

  try {
    const classifications = await postHuggingFaceModel<SafetyClassification[]>(
      model,
      {
        inputs: await readOptimizedImageAsBase64(localFilePath),
        parameters: {
          function_to_apply: 'softmax',
          top_k: 5
        }
      },
      {
        providerName: 'Hugging Face Safety Classification',
        timeoutMs: 45000
      }
    );

    if (!Array.isArray(classifications)) {
      throw new Error('Invalid response structure from Hugging Face safety classification.');
    }

    const result = mapSafetyClassification(classifications, threshold);
    const visualReview = await reviewVisualSafety(localFilePath);
    const mergedResult = mergeSafetyResults(result, visualReview);

    console.log(
      `[AI Service] Safety result - Flagged: ${mergedResult.flagged}, Category: ${mergedResult.flagCategory || 'none'}, Confidence: ${mergedResult.confidence.toFixed(3)}`
    );

    return mergedResult;
  } catch (error: any) {
    console.error('[AI Service] Hugging Face safety classification failed:', error.message);
    throw new Error(`Hugging Face Safety Classification failed: ${error.message}`);
  }
}
