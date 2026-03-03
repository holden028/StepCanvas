import type { AISettings, AppSettings, BrandingSettings, GuideData } from './types';

export const DEFAULT_AI_SETTINGS: AISettings = {
  aiEnabled: false,
  openRouterApiKey: '',
  model: 'google/gemini-2.0-flash-001',
  temperature: 0.2,
  maxTokens: 1024,
  enrichOnCapture: true,
  localOnlyMode: false,
  confidenceThreshold: 0.6,
};

export const DEFAULT_BRANDING: BrandingSettings = {
  brandName: '',
  logoPath: '',
  backgroundPath: '',
  primaryColor: '#2563eb',
  authorName: '',
  authorRole: '',
  includeCoverPage: false,
  showDate: true,
  purposeSummary: '',
  highlights: [],
};

export const DEFAULT_SETTINGS: AppSettings = {
  screenshotMode: 'snippet',
  screenshotWidth: 800,
  screenshotHeight: 600,
  imageQuality: 85,
  defaultExportFormat: 'markdown',
  autoNumberTitles: true,
  maskKeystrokes: false,
  excludedApps: [],
  namingMode: 'hybrid',
  ai: { ...DEFAULT_AI_SETTINGS },
  branding: { ...DEFAULT_BRANDING },
};

function detectPlatform(): NodeJS.Platform {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform;
  }
  if (typeof navigator !== 'undefined') {
    const agent = navigator.userAgent.toLowerCase();
    if (agent.includes('mac')) return 'darwin';
    if (agent.includes('win')) return 'win32';
    if (agent.includes('linux')) return 'linux';
  }
  return 'darwin';
}

export function createEmptyGuide(): GuideData {
  const now = Date.now();
  return {
    version: 1,
    meta: {
      id: `guide-${now}`,
      title: 'Untitled Guide',
      createdAt: now,
      updatedAt: now,
      sourcePlatform: detectPlatform(),
    },
    settings: { ...DEFAULT_SETTINGS },
    chapters: [],
    steps: [],
    reviewCompleted: false,
    nextStepNumber: 1,
  };
}
