import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AISettings, OcrResult } from '../../shared/types';
import { callOpenRouter, imageToBase64DataUrl } from './openRouterClient';
import type { ChatMessage, ContentPart } from './openRouterClient';

const LOCAL_CONFIDENCE_THRESHOLD = 0.3;

export async function runLocalOcr(imagePath: string): Promise<OcrResult> {
  if (process.platform !== 'darwin') {
    return { rawText: '', normalizedText: '', confidence: 0, source: 'local' };
  }

  if (!imagePath || !fs.existsSync(imagePath)) {
    return { rawText: '', normalizedText: '', confidence: 0, source: 'local' };
  }

  try {
    const text = await macVisionOcr(imagePath);
    const normalized = text.replace(/\s+/g, ' ').trim();
    const confidence = normalized.length > 3 ? 0.8 : normalized.length > 0 ? 0.4 : 0;
    return { rawText: text, normalizedText: normalized, confidence, source: 'local' };
  } catch (err) {
    console.warn('Local OCR failed:', err);
    return { rawText: '', normalizedText: '', confidence: 0, source: 'local' };
  }
}

function macVisionOcr(imagePath: string): Promise<string> {
  const absolutePath = path.resolve(imagePath);
  const script = `
use framework "Vision"
use framework "Foundation"

set imagePath to POSIX file "${absolutePath.replace(/"/g, '\\"')}"
set imageURL to current application's NSURL's fileURLWithPath:(POSIX path of imagePath)
set requestHandler to current application's VNImageRequestHandler's alloc()'s initWithURL:imageURL options:(current application's NSDictionary's dictionary())
set textRequest to current application's VNRecognizeTextRequest's alloc()'s init()
textRequest's setRecognitionLevel:(current application's VNRequestTextRecognitionLevelAccurate)
requestHandler's performRequests:(current application's NSArray's arrayWithObject:textRequest) |error|:(missing value)
set results to textRequest's results()
set outputText to ""
repeat with obs in results
  set candidates to obs's topCandidates:1
  if (count of candidates) > 0 then
    set outputText to outputText & ((item 1 of candidates)'s |string|() as text) & linefeed
  end if
end repeat
return outputText
`;

  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'AppleScript', '-e', script], { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve((stdout ?? '').trim());
    });
  });
}

export async function runHybridOcr(
  imagePath: string,
  aiSettings: AISettings,
): Promise<OcrResult> {
  const localResult = await runLocalOcr(imagePath);

  if (localResult.confidence >= LOCAL_CONFIDENCE_THRESHOLD && localResult.normalizedText.length > 5) {
    return localResult;
  }

  if (aiSettings.localOnlyMode || !aiSettings.aiEnabled || !aiSettings.openRouterApiKey) {
    return localResult;
  }

  try {
    const dataUrl = imageToBase64DataUrl(imagePath);
    if (!dataUrl) return localResult;

    const parts: ContentPart[] = [
      { type: 'text', text: 'Extract ALL visible text from this screenshot. Return only the raw extracted text, nothing else. Include button labels, menu items, headings, links, form labels, and any other visible text.' },
      { type: 'image_url', image_url: { url: dataUrl } },
    ];

    const messages: ChatMessage[] = [{ role: 'user', content: parts }];
    const response = await callOpenRouter(aiSettings, messages);
    const normalized = response.replace(/\s+/g, ' ').trim();

    return {
      rawText: response,
      normalizedText: normalized,
      confidence: normalized.length > 10 ? 0.9 : 0.5,
      source: 'openrouter',
    };
  } catch (err) {
    console.warn('OpenRouter OCR fallback failed:', err);
    return localResult;
  }
}
