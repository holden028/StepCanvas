import { create } from 'zustand';
import type { AISettings, BrandingSettings, Chapter, GuideData, NamingMode, PermissionStatus, RecaptureTarget, Step, StepProposal } from '../../shared/types';
import { createEmptyGuide, DEFAULT_AI_SETTINGS, DEFAULT_BRANDING, DEFAULT_SETTINGS } from '../../shared/defaults';
import { validateGuide } from './validation';
import { classifyApp, resolveAppLabel } from './appClassification';

export type ActiveView = { type: 'step'; stepId: string } | { type: 'coverPage' } | null;

interface AppState {
  isRecording: boolean;
  isPaused: boolean;
  activeStepId: string | null;
  activeView: ActiveView;
  manualBypass: boolean;
  guidePath: string | null;
  recentGuides: string[];
  permissions: PermissionStatus;
  guide: GuideData;
  recaptureTarget: RecaptureTarget | null;
  enrichingStepIds: Set<string>;

  setRecording: (status: boolean) => void;
  setPaused: (status: boolean) => void;
  setManualBypass: (status: boolean) => void;
  setGuide: (guide: GuideData, guidePath?: string | null) => void;
  resetGuide: () => void;
  setGuidePath: (path: string | null) => void;
  setRecentGuides: (paths: string[]) => void;
  setActiveStep: (id: string | null) => void;
  setActiveView: (view: ActiveView) => void;
  setPermissions: (permissions: PermissionStatus) => void;
  setSettings: (updates: Partial<GuideData['settings']>) => void;
  setAiSettings: (updates: Partial<AISettings>) => void;
  setBrandingSettings: (updates: Partial<BrandingSettings>) => void;
  setReviewCompleted: (status: boolean) => void;
  setRecaptureTarget: (target: RecaptureTarget | null) => void;
  addCapturedStep: (stepData: Omit<Step, 'id' | 'title' | 'description' | 'annotations'>) => Step;
  addManualStep: (index?: number) => void;
  updateStep: (id: string, updates: Partial<Step>) => void;
  removeStep: (id: string) => void;
  duplicateStep: (id: string) => void;
  reorderSteps: (fromIndex: number, toIndex: number) => void;
  applySidebarOrder: (orderedIds: string[]) => void;
  addChapter: (title?: string, afterStepId?: string) => void;
  updateChapter: (id: string, updates: Partial<Chapter>) => void;
  removeChapter: (id: string) => void;
  assignStepToChapter: (stepId: string, chapterId: string | undefined) => void;
  validateGuide: () => { ok: boolean; message?: string };
  applyProposal: (stepId: string, proposal: StepProposal) => void;
  rejectProposal: (stepId: string) => void;
  acceptAllHighConfidence: () => void;
  setEnriching: (stepId: string, active: boolean) => void;
}

function reorderArray<T>(input: T[], from: number, to: number): T[] {
  const next = [...input];
  const [moved] = next.splice(from, 1);
  if (!moved) {
    return input;
  }
  next.splice(to, 0, moved);
  return next;
}

function renumberSteps(steps: Step[], autoNumber: boolean): Step[] {
  if (!autoNumber) return steps;
  return steps.map((step, i) => {
    const num = i + 1;
    const stripped = step.title.replace(/^Step \d+:\s*/, '');
    return { ...step, title: `Step ${num}: ${stripped}` };
  });
}

function isBrowser(appName?: string): boolean {
  if (!appName) return false;
  return classifyApp(appName) === 'browser';
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const short = host + (parsed.pathname !== '/' ? parsed.pathname : '');
    return short.length > 60 ? short.slice(0, 57) + '...' : short;
  } catch {
    return url.length > 60 ? url.slice(0, 57) + '...' : url;
  }
}

function toTitleAndDescription(
  nextStepNumber: number,
  stepData: Omit<Step, 'id' | 'title' | 'description' | 'annotations'>,
  namingMode: NamingMode,
  previousStep?: Step,
): {
  title: string;
  description: string;
} {
  if (stepData.type === 'click' && stepData.clickTargetLabel) {
    const [kindRaw, ...parts] = stepData.clickTargetLabel.split(':');
    const label = (parts.join(':').trim() || kindRaw.trim()).replaceAll('"', "'");
    if (label.length > 0) {
      const appLabel = stepData.appName ? resolveAppLabel(stepData.appName, namingMode) : undefined;
      const contextBits = [
        appLabel ? `in ${appLabel}` : undefined,
        stepData.windowTitle ? `window "${stepData.windowTitle}"` : undefined,
        stepData.currentUrl ? `URL ${sanitizeUrl(stepData.currentUrl)}` : undefined,
      ].filter(Boolean);
      return {
        title: `Step ${nextStepNumber}: Click "${label}"`,
        description:
          contextBits.length > 0
            ? `Click "${label}" ${contextBits.join(' • ')}.`
            : `Click "${label}".`,
      };
    }
  }

  if (stepData.type === 'keypress') {
    const rawKey = stepData.key ?? '';
    const safeKey = rawKey.startsWith('[') && rawKey.endsWith(']') ? '' : rawKey;
    const keyPreview = safeKey && safeKey !== '*' ? `Typed: ${safeKey}` : 'Typed in sensitive field.';
    const appLabel = stepData.appName ? resolveAppLabel(stepData.appName, namingMode) : '';
    const windowInfo = stepData.windowTitle ? ` Window: "${stepData.windowTitle}".` : '';
    const urlInfo = stepData.currentUrl ? ` URL: ${sanitizeUrl(stepData.currentUrl)}.` : '';
    return {
      title: `Step ${nextStepNumber}: Enter text`,
      description: appLabel ? `In ${appLabel}, enter text. ${keyPreview}${windowInfo}${urlInfo}` : `Enter text. ${keyPreview}${windowInfo}${urlInfo}`,
    };
  }

  if (isBrowser(stepData.appName) && stepData.currentUrl && previousStep?.currentUrl !== stepData.currentUrl) {
    const appLabel = stepData.appName ? resolveAppLabel(stepData.appName, namingMode) : 'browser';
    const shortUrl = sanitizeUrl(stepData.currentUrl);
    return {
      title: `Step ${nextStepNumber}: Navigate to ${shortUrl}`,
      description: stepData.windowTitle
        ? `In ${appLabel}, open "${stepData.windowTitle}".`
        : `In ${appLabel}, open ${stepData.currentUrl}.`,
    };
  }

  if (stepData.appName) {
    const appLabel = resolveAppLabel(stepData.appName, namingMode);
    const urlInfo = stepData.currentUrl ? ` URL: ${sanitizeUrl(stepData.currentUrl)}.` : '';
    const clickInfo =
      stepData.type === 'click' && typeof stepData.x === 'number' && typeof stepData.y === 'number'
        ? ` Click position: (${Math.round(stepData.x)}, ${Math.round(stepData.y)}).`
        : '';
    return {
      title: stepData.type === 'click' ? `Step ${nextStepNumber}: Click in ${appLabel}` : `Step ${nextStepNumber}: Go to ${appLabel}`,
      description: stepData.windowTitle
        ? `Focus "${stepData.windowTitle}" and click the target area.${urlInfo}${clickInfo}`
        : `In ${appLabel}, click the target area.${urlInfo}${clickInfo}`,
    };
  }

  return {
    title: `Step ${nextStepNumber}: Click`,
    description: '',
  };
}

export const useStore = create<AppState>((set, get) => ({
  isRecording: false,
  isPaused: false,
  activeStepId: null,
  activeView: null,
  manualBypass: false,
  guidePath: null,
  recentGuides: [],
  permissions: {
    accessibility: false,
    screenRecording: false,
  },
  guide: createEmptyGuide(),
  recaptureTarget: null,
  enrichingStepIds: new Set(),

  setRecording: (isRecording) => set({ isRecording }),
  setPaused: (isPaused) => set({ isPaused }),
  setManualBypass: (manualBypass) => set({ manualBypass }),

  setGuide: (guide, guidePath = null) =>
    set({
      guide: {
        ...guide,
        chapters: guide.chapters ?? [],
        settings: {
          ...DEFAULT_SETTINGS,
          ...guide.settings,
          ai: { ...DEFAULT_AI_SETTINGS, ...guide.settings?.ai },
          branding: { ...DEFAULT_BRANDING, ...guide.settings?.branding },
        },
      },
      guidePath,
      activeStepId: guide.steps[0]?.id ?? null,
    }),
  resetGuide: () => set({ guide: createEmptyGuide(), guidePath: null, activeStepId: null }),
  setGuidePath: (guidePath) => set({ guidePath }),
  setRecentGuides: (recentGuides) => set({ recentGuides }),
  setActiveStep: (activeStepId) => set({ activeStepId, activeView: activeStepId ? { type: 'step', stepId: activeStepId } : null }),
  setActiveView: (activeView) => set({
    activeView,
    activeStepId: activeView?.type === 'step' ? activeView.stepId : null,
  }),
  setPermissions: (permissions) => set({ permissions }),
  setSettings: (updates) =>
    set((state) => ({
      guide: {
        ...state.guide,
        settings: {
          ...state.guide.settings,
          ...updates,
        },
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),
  setAiSettings: (updates) =>
    set((state) => ({
      guide: {
        ...state.guide,
        settings: {
          ...state.guide.settings,
          ai: { ...state.guide.settings.ai, ...updates },
        },
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),
  setBrandingSettings: (updates) =>
    set((state) => ({
      guide: {
        ...state.guide,
        settings: {
          ...state.guide.settings,
          branding: { ...state.guide.settings.branding, ...updates },
        },
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),
  setReviewCompleted: (status) =>
    set((state) => ({
      guide: {
        ...state.guide,
        reviewCompleted: status,
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),
  setRecaptureTarget: (recaptureTarget) => set({ recaptureTarget }),

  addCapturedStep: (stepData) => {
    const state = get();
    const nextStepNumber = state.guide.nextStepNumber;
    const namingMode = state.guide.settings.namingMode ?? 'hybrid';
    const previousStep = state.guide.steps[state.guide.steps.length - 1];
    const { title, description } = toTitleAndDescription(nextStepNumber, stepData, namingMode, previousStep);
    const newStep: Step = {
      ...stepData,
      id: `step-${nextStepNumber.toString().padStart(4, '0')}`,
      title,
      description,
      annotations: [],
    };
    set((currentState) => {
      const steps = [...currentState.guide.steps, newStep];
      return {
        guide: {
          ...currentState.guide,
          steps: renumberSteps(steps, currentState.guide.settings.autoNumberTitles),
          nextStepNumber: currentState.guide.nextStepNumber + 1,
          reviewCompleted: false,
          meta: { ...currentState.guide.meta, updatedAt: Date.now() },
        },
        activeStepId: currentState.activeStepId ?? newStep.id,
      };
    });
    return newStep;
  },

  addManualStep: (index) =>
    set((state) => {
      const nextStepNumber = state.guide.nextStepNumber;
      const newStep: Step = {
        id: `step-${nextStepNumber.toString().padStart(4, '0')}`,
        type: 'text',
        title: `Step ${nextStepNumber}: Manual step`,
        description: '',
        timestamp: Date.now(),
        annotations: [],
      };
      const steps = [...state.guide.steps];
      const targetIndex = typeof index === 'number' ? Math.max(0, Math.min(index, steps.length)) : steps.length;
      steps.splice(targetIndex, 0, newStep);
      return {
        guide: {
          ...state.guide,
          steps: renumberSteps(steps, state.guide.settings.autoNumberTitles),
          nextStepNumber: nextStepNumber + 1,
          reviewCompleted: false,
          meta: { ...state.guide.meta, updatedAt: Date.now() },
        },
        activeStepId: newStep.id,
      };
    }),

  updateStep: (id, updates) =>
    set((state) => ({
      guide: {
        ...state.guide,
        steps: state.guide.steps.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        reviewCompleted: false,
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),

  removeStep: (id) =>
    set((state) => {
      const deletedIndex = state.guide.steps.findIndex((s) => s.id === id);
      const steps = state.guide.steps.filter((s) => s.id !== id);
      let nextActiveId = state.activeStepId;
      if (state.activeStepId === id) {
        const nearestIndex = Math.min(deletedIndex, steps.length - 1);
        nextActiveId = nearestIndex >= 0 ? steps[nearestIndex].id : null;
      }
      return {
        guide: {
          ...state.guide,
          steps: renumberSteps(steps, state.guide.settings.autoNumberTitles),
          reviewCompleted: false,
          meta: { ...state.guide.meta, updatedAt: Date.now() },
        },
        activeStepId: nextActiveId,
      };
    }),

  duplicateStep: (id) =>
    set((state) => {
      const index = state.guide.steps.findIndex((step) => step.id === id);
      if (index < 0) {
        return state;
      }
      const source = state.guide.steps[index];
      const nextStepNumber = state.guide.nextStepNumber;
      const duplicate: Step = {
        ...source,
        id: `step-${nextStepNumber.toString().padStart(4, '0')}`,
        title: `${source.title} (Copy)`,
        timestamp: Date.now(),
      };
      const steps = [...state.guide.steps];
      steps.splice(index + 1, 0, duplicate);
      return {
        guide: {
          ...state.guide,
          steps: renumberSteps(steps, state.guide.settings.autoNumberTitles),
          nextStepNumber: nextStepNumber + 1,
          reviewCompleted: false,
          meta: { ...state.guide.meta, updatedAt: Date.now() },
        },
        activeStepId: duplicate.id,
      };
    }),

  reorderSteps: (fromIndex, toIndex) =>
    set((state) => ({
      guide: {
        ...state.guide,
        steps: renumberSteps(reorderArray(state.guide.steps, fromIndex, toIndex), state.guide.settings.autoNumberTitles),
        reviewCompleted: false,
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),

  applySidebarOrder: (orderedIds) =>
    set((state) => {
      const chapterMap = new Map(state.guide.chapters.map((c) => [c.id, c]));
      const stepMap = new Map(state.guide.steps.map((s) => [s.id, s]));

      const newChapters: Chapter[] = [];
      const newSteps: Step[] = [];
      let currentChapterId: string | undefined;

      for (const id of orderedIds) {
        if (chapterMap.has(id)) {
          newChapters.push(chapterMap.get(id)!);
          currentChapterId = id;
        } else if (stepMap.has(id)) {
          const step = stepMap.get(id)!;
          newSteps.push({ ...step, chapterId: currentChapterId });
        }
      }

      // Add any steps not in orderedIds (shouldn't happen, but safety)
      for (const step of state.guide.steps) {
        if (!newSteps.some((s) => s.id === step.id)) {
          newSteps.push(step);
        }
      }

      return {
        guide: {
          ...state.guide,
          chapters: newChapters,
          steps: renumberSteps(newSteps, state.guide.settings.autoNumberTitles),
          reviewCompleted: false,
          meta: { ...state.guide.meta, updatedAt: Date.now() },
        },
      };
    }),

  addChapter: (title, afterStepId) =>
    set((state) => {
      const id = `ch-${Date.now().toString(36)}`;
      const newChapter: Chapter = { id, title: title || 'New Chapter' };
      const chapters = [...state.guide.chapters, newChapter];
      let steps = state.guide.steps;
      if (afterStepId) {
        const idx = steps.findIndex((s) => s.id === afterStepId);
        if (idx >= 0) {
          steps = steps.map((s, i) => (i > idx && !s.chapterId ? { ...s, chapterId: id } : s));
        }
      }
      return {
        guide: {
          ...state.guide,
          chapters,
          steps,
          meta: { ...state.guide.meta, updatedAt: Date.now() },
        },
      };
    }),

  updateChapter: (id, updates) =>
    set((state) => ({
      guide: {
        ...state.guide,
        chapters: state.guide.chapters.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),

  removeChapter: (id) =>
    set((state) => ({
      guide: {
        ...state.guide,
        chapters: state.guide.chapters.filter((c) => c.id !== id),
        steps: state.guide.steps.map((s) => (s.chapterId === id ? { ...s, chapterId: undefined } : s)),
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),

  assignStepToChapter: (stepId, chapterId) =>
    set((state) => ({
      guide: {
        ...state.guide,
        steps: state.guide.steps.map((s) => (s.id === stepId ? { ...s, chapterId } : s)),
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),

  applyProposal: (stepId, proposal) =>
    set((state) => ({
      guide: {
        ...state.guide,
        steps: state.guide.steps.map((s) =>
          s.id === stepId
            ? {
                ...s,
                title: proposal.proposedTitle ?? s.title,
                description: proposal.proposedDescription ?? s.description,
                proposal: { ...proposal, status: 'accepted' },
              }
            : s,
        ),
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),
  rejectProposal: (stepId) =>
    set((state) => ({
      guide: {
        ...state.guide,
        steps: state.guide.steps.map((s) =>
          s.id === stepId && s.proposal
            ? { ...s, proposal: { ...s.proposal, status: 'rejected' } }
            : s,
        ),
        meta: { ...state.guide.meta, updatedAt: Date.now() },
      },
    })),
  acceptAllHighConfidence: () =>
    set((state) => {
      const threshold = state.guide.settings.ai?.confidenceThreshold ?? 0.6;
      return {
        guide: {
          ...state.guide,
          steps: state.guide.steps.map((s) => {
            if (
              s.proposal?.status === 'ready' &&
              (s.proposal.confidence ?? 0) >= threshold
            ) {
              return {
                ...s,
                title: s.proposal.proposedTitle ?? s.title,
                description: s.proposal.proposedDescription ?? s.description,
                proposal: { ...s.proposal, status: 'accepted' },
              };
            }
            return s;
          }),
          meta: { ...state.guide.meta, updatedAt: Date.now() },
        },
      };
    }),
  setEnriching: (stepId, active) =>
    set((state) => {
      const next = new Set(state.enrichingStepIds);
      if (active) next.add(stepId);
      else next.delete(stepId);
      return { enrichingStepIds: next };
    }),

  validateGuide: () => validateGuide(get().guide),
}));
