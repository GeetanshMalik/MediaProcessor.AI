import { postHuggingFaceChatCompletion, readOptimizedImageAsDataUrl } from './ai-client';

const DEFAULT_CAPTION_MODEL = 'meta-llama/Llama-4-Scout-17B-16E-Instruct:groq';
const DEFAULT_CAPTION_PROMPT = 'Describe this image in exactly one detailed sentence. Do not use bullet points, multiple sentences, or line breaks.';
const DEFAULT_CAPTION_MAX_TOKENS = 45;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function getCaptionModel() {
  return process.env.HUGGINGFACE_CAPTION_MODEL?.trim() || DEFAULT_CAPTION_MODEL;
}

function getCaptionPrompt() {
  return process.env.HUGGINGFACE_CAPTION_PROMPT?.trim() || DEFAULT_CAPTION_PROMPT;
}

function getCaptionMaxTokens() {
  const configuredMaxTokens = Number(process.env.HUGGINGFACE_CAPTION_MAX_TOKENS);
  return Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 0
    ? configuredMaxTokens
    : DEFAULT_CAPTION_MAX_TOKENS;
}

function extractCaption(response: ChatCompletionResponse) {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return toOneLineCaption(content);
  }

  if (Array.isArray(content)) {
    return toOneLineCaption(content
      .map(part => part.text)
      .filter(Boolean)
      .join(' ')
    );
  }

  return '';
}

export function toOneLineCaption(content: string) {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  const firstSentence = oneLine.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  return firstSentence || oneLine;
}

export async function generateCaption(localFilePath: string): Promise<string> {
  const model = getCaptionModel();
  const prompt = getCaptionPrompt();

  try {
    const imageUrl = await readOptimizedImageAsDataUrl(localFilePath);
    const response = await postHuggingFaceChatCompletion<ChatCompletionResponse>(
      {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: getCaptionMaxTokens(),
        stream: false
      },
      {
        providerName: 'Hugging Face Captioning',
        timeoutMs: 60000
      }
    );

    const caption = extractCaption(response);
    if (!caption) {
      throw new Error('Invalid response structure from Hugging Face captioning.');
    }

    console.log(`[AI Service] Caption generated: "${caption}"`);
    return caption;
  } catch (error: any) {
    console.error('[AI Service] Hugging Face captioning failed:', error.message);
    throw new Error(`Hugging Face Captioning failed: ${error.message}`);
  }
}
