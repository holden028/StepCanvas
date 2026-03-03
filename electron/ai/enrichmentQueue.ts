import type { AISettings, StepProposal } from '../../shared/types';
import { callOpenRouter, imageToBase64DataUrl, parseJsonFromLlm } from './openRouterClient';
import { runHybridOcr } from './ocr';
import type { ChatMessage, ContentPart } from './openRouterClient';

interface EnrichmentInput {
  stepId: string;
  screenshotPath?: string;
  appName?: string;
  windowTitle?: string;
  currentUrl?: string;
  clickTargetLabel?: string;
  typedText?: string;
  ocrText?: string;
  neighborContext?: string;
  existingTitle?: string;
  existingDescription?: string;
  stepNumber?: number;
  totalSteps?: number;
  aiSettings: AISettings;
}

interface LlmProposal {
  title: string;
  description: string;
  actionType?: string;
  targetLabel?: string;
  typedValue?: string;
  confidence: number;
  reasons?: string[];
}

const SENSITIVE_PATTERNS = [
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi,
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  /\b\d{2,3}[-.]?\d{6,8}\b/g,
];

function redactSensitiveText(text: string): string {
  let redacted = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

const SYSTEM_PROMPT = `You are StepCanvas, an expert technical writer producing Scribe-style step-by-step documentation from desktop/web workflow screenshots. Your goal is to produce documentation that reads naturally and is immediately useful to someone following along.

## Title Rules
- Short imperative phrase describing the EXACT action the user performed
- For clicks: "Click '{{exact button/link text}}'" — use the EXACT label from the UI, in single quotes
- For typing: "Type '{{text}}'" or "Enter '{{text}}' in the {{field name}}"
- For navigation: "Navigate to {{site/page name}}" (use site name, not full URL)
- For keyboard shortcuts: "Open a new tab" / "Close the current tab" / "Refresh the page"
- For scrolling: "Scroll down to '{{section}}'"
- For selections: "Select '{{option}}' from the {{dropdown/menu name}}"
- NEVER use generic titles like "Click in Web Browser" — always identify the specific element
- NEVER include "Step N:" prefix — just the action phrase

## Description Rules
- 1-2 sentences: what the user is doing and why, with precise context
- Include the app/site name: "In the Moodle admin panel at moodle.nanofibre.co.uk..."
- Mention the page section or area: "...in the Reports section under Site Administration"
- For navigation: explain what page/section appears after the action
- Be specific about UI locations: "The button appears in the left sidebar navigation"
- NEVER include raw coordinates, pixel positions, or technical metadata
- NEVER mention OCR, confidence scores, or AI processing in the description

## Examples
Click: {"title":"Click 'Site administration'","description":"Navigate to the Site administration section in the Nano Academy dashboard. The 'Site administration' tab appears in the navigation bar.","actionType":"click","targetLabel":"Site administration","confidence":0.95,"reasons":["OCR shows 'Site administration' text at click location"]}
Type: {"title":"Enter 'moodle.nanofibre.co.uk' in the address bar","description":"Type the Moodle platform URL into the browser address bar to navigate to the Nano Fibre UK learning management system.","actionType":"type","typedValue":"moodle.nanofibre.co.uk","confidence":0.9,"reasons":["URL visible in address bar","typed text matches URL"]}
Navigate: {"title":"Navigate to the Daily Reward Winners report","description":"The Daily Reward Winners report page loads under Reports > Site administration, showing reward data for all enrolled users.","actionType":"navigate","confidence":0.85,"reasons":["URL changed to report page","page title matches"]}

## Analysis Strategy
1. Examine the screenshot for UI context — what app, what page, what section
2. Use OCR text to identify the exact element at or near the click point
3. Cross-reference with the DOM context, URL, and window title
4. If an existing title was generated from heuristics, improve it with specifics from the screenshot
5. If context is unclear, still give your best interpretation but lower confidence

Return ONLY valid JSON (no markdown fences, no explanation):
{"title":"...","description":"...","actionType":"click|type|navigate|shortcut|scroll|select","targetLabel":"...","typedValue":"...","confidence":0.85,"reasons":["..."]}`;

export async function enrichStep(input: EnrichmentInput): Promise<StepProposal> {
  const { stepId, aiSettings } = input;

  if (!aiSettings.aiEnabled || !aiSettings.openRouterApiKey) {
    return { stepId, status: 'failed', error: 'AI not enabled or no API key.' };
  }

  if (aiSettings.localOnlyMode) {
    return { stepId, status: 'failed', error: 'Local-only mode is active. Cloud enrichment skipped.' };
  }

  try {
    let ocrText = input.ocrText ?? '';
    let ocrResult = undefined;

    if (input.screenshotPath && !ocrText) {
      const ocr = await runHybridOcr(input.screenshotPath, aiSettings);
      ocrText = ocr.normalizedText;
      ocrResult = ocr;
    }

    ocrText = redactSensitiveText(ocrText);

    const contextLines: string[] = [];
    if (input.stepNumber) contextLines.push(`Step ${input.stepNumber} of ${input.totalSteps ?? '?'}`);
    if (input.existingTitle) contextLines.push(`Current title (heuristic): ${input.existingTitle}`);
    if (input.existingDescription) contextLines.push(`Current description (heuristic): ${input.existingDescription}`);
    if (input.appName) contextLines.push(`Application: ${input.appName}`);
    if (input.windowTitle) contextLines.push(`Window title: ${input.windowTitle}`);
    if (input.currentUrl) contextLines.push(`URL: ${input.currentUrl}`);
    if (input.clickTargetLabel) contextLines.push(`DOM element at click point: ${input.clickTargetLabel}`);
    if (input.typedText) contextLines.push(`Typed text: "${input.typedText}"`);
    if (ocrText) contextLines.push(`OCR text visible on screen:\n${ocrText.slice(0, 1200)}`);
    if (input.neighborContext) contextLines.push(`Surrounding steps in this guide: ${input.neighborContext}`);

    const userText = `Analyze this step screenshot and produce a precise, Scribe-style title and description. Improve the heuristic title if one is provided — use the screenshot and OCR to identify the exact UI element or action.\n\nContext:\n${contextLines.join('\n')}`;

    const parts: ContentPart[] = [{ type: 'text', text: userText }];

    const dataUrl = input.screenshotPath ? imageToBase64DataUrl(input.screenshotPath) : null;
    if (dataUrl) {
      parts.push({ type: 'image_url', image_url: { url: dataUrl } });
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: parts },
    ];

    const raw = await callOpenRouter(aiSettings, messages);
    const parsed = parseJsonFromLlm<LlmProposal>(raw);

    return {
      stepId,
      status: 'ready',
      proposedTitle: parsed.title,
      proposedDescription: parsed.description,
      proposedActionType: parsed.actionType,
      proposedTargetLabel: parsed.targetLabel,
      proposedTypedValue: parsed.typedValue,
      confidence: parsed.confidence ?? 0.5,
      reasons: parsed.reasons,
      ocrResult,
    };
  } catch (err) {
    console.error(`Enrichment failed for step ${stepId}:`, err);
    return {
      stepId,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Unknown enrichment error.',
    };
  }
}
