import fs from 'node:fs';
import path from 'node:path';
import type { AISettings } from '../../shared/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

const MAX_RETRIES = 2;
const TIMEOUT_MS = 30_000;

export async function callOpenRouter(
  settings: AISettings,
  messages: ChatMessage[],
): Promise<string> {
  if (!settings.openRouterApiKey) {
    throw new Error('OpenRouter API key is not configured.');
  }

  let lastError = '';
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.openRouterApiKey}`,
          'HTTP-Referer': 'https://stepcanvas.app',
          'X-Title': 'StepCanvas',
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          messages,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        lastError = `OpenRouter HTTP ${res.status}: ${text.slice(0, 200)}`;
        if (res.status === 429 || res.status >= 500) {
          await delay(1000 * (attempt + 1));
          continue;
        }
        throw new Error(lastError);
      }

      const json = (await res.json()) as OpenRouterResponse;
      if (json.error?.message) {
        throw new Error(`OpenRouter API error: ${json.error.message}`);
      }

      const content = json.choices?.[0]?.message?.content ?? '';
      if (!content) {
        throw new Error('OpenRouter returned empty content.');
      }
      return content;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = 'OpenRouter request timed out.';
      } else if (err instanceof Error) {
        lastError = err.message;
      }
      if (attempt < MAX_RETRIES) {
        await delay(800 * (attempt + 1));
        continue;
      }
    }
  }

  throw new Error(lastError || 'OpenRouter call failed after retries.');
}

export function parseJsonFromLlm<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : raw.trim();
  return JSON.parse(jsonStr) as T;
}

export function imageToBase64DataUrl(imagePath: string): string | null {
  if (!imagePath || !path.isAbsolute(imagePath) || !fs.existsSync(imagePath)) {
    return null;
  }
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const base64 = fs.readFileSync(imagePath, 'base64');
  return `data:${mime};base64,${base64}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
