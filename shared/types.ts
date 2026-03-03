export type StepType = 'click' | 'keypress' | 'text';

export type AnnotationType = 'arrow' | 'circle' | 'text' | 'blur' | 'crop';

export interface StepAnnotation {
  id: string;
  type: AnnotationType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  baseWidth?: number;
  baseHeight?: number;
}

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Chapter {
  id: string;
  title: string;
}

export interface Step {
  id: string;
  type: StepType;
  title: string;
  description: string;
  timestamp: number;
  chapterId?: string;
  screenshotPath?: string;
  screenshotFullPath?: string;
  screenshotRegion?: CaptureRegion;
  x?: number;
  y?: number;
  key?: string;
  keycode?: number;
  modifiers?: KeyModifiers;
  appName?: string;
  windowTitle?: string;
  currentUrl?: string;
  clickTargetLabel?: string;
  additionalInstructions?: string;
  sensitiveInput?: boolean;
  annotations: StepAnnotation[];
  ocrResult?: OcrResult;
  proposal?: StepProposal;
}

export interface GuideMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  sourcePlatform: NodeJS.Platform;
}

export type ScreenshotMode = 'snippet' | 'fullscreen' | 'both';
export type NamingMode = 'generic' | 'specific' | 'hybrid';

export interface AppSettings {
  screenshotMode: ScreenshotMode;
  screenshotWidth: number;
  screenshotHeight: number;
  imageQuality: number;
  defaultExportFormat: ExportFormat;
  autoNumberTitles: boolean;
  maskKeystrokes: boolean;
  excludedApps: string[];
  namingMode: NamingMode;
  ai: AISettings;
  branding: BrandingSettings;
}

export interface GuideData {
  version: 1;
  meta: GuideMeta;
  settings: AppSettings;
  chapters: Chapter[];
  steps: Step[];
  reviewCompleted: boolean;
  nextStepNumber: number;
}

export type ExportFormat = 'json' | 'markdown' | 'html' | 'pdf' | 'docx' | 'pptx';

export interface PermissionStatus {
  accessibility: boolean;
  screenRecording: boolean;
}

export interface KeyModifiers {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export interface RecorderEvent {
  type: 'click' | 'keydown';
  x?: number;
  y?: number;
  time: number;
  key?: string;
  keycode?: number;
  modifiers?: KeyModifiers;
  imagePath?: string;
  imageFullPath?: string;
  region?: CaptureRegion;
  appName?: string;
  windowTitle?: string;
  currentUrl?: string;
  clickTargetLabel?: string;
  sensitiveInput?: boolean;
  activeInputText?: string;
}

export interface RecorderConfig {
  screenshotMode: ScreenshotMode;
  screenshotWidth: number;
  screenshotHeight: number;
  imageQuality: number;
  maskKeystrokes: boolean;
  excludedApps: string[];
  namingMode: NamingMode;
}

export type RecaptureStrategy = 'single' | 'from-here';

export interface RecaptureTarget {
  stepId: string;
  strategy: RecaptureStrategy;
}

// --- AI / OCR / Enrichment ---

export type OcrSource = 'local' | 'openrouter';

export interface OcrResult {
  rawText: string;
  normalizedText: string;
  confidence: number;
  source: OcrSource;
}

export type ProposalStatus = 'pending' | 'running' | 'ready' | 'accepted' | 'rejected' | 'edited' | 'failed';

export interface StepProposal {
  stepId: string;
  status: ProposalStatus;
  proposedTitle?: string;
  proposedDescription?: string;
  proposedActionType?: string;
  proposedTargetLabel?: string;
  proposedTypedValue?: string;
  confidence?: number;
  reasons?: string[];
  ocrResult?: OcrResult;
  error?: string;
}

export interface AISettings {
  aiEnabled: boolean;
  openRouterApiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enrichOnCapture: boolean;
  localOnlyMode: boolean;
  confidenceThreshold: number;
}

export interface BrandingSettings {
  brandName: string;
  logoPath: string;
  backgroundPath: string;
  primaryColor: string;
  authorName: string;
  authorRole: string;
  includeCoverPage: boolean;
  showDate: boolean;
  purposeSummary: string;
  highlights: string[];
}
