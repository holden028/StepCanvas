import React, { useEffect } from 'react';
import { useStore } from './store/useStore';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { StepEditor } from './components/StepEditor';
import { CoverPageEditor } from './components/CoverPageEditor';
import { ShieldAlert, Loader2, Sparkles } from 'lucide-react';
import type { GuideData, RecorderEvent } from '../shared/types';

interface PermissionDetails {
  platform: string;
  accessibilityTrusted: boolean;
  screenRecordingStatus: string;
  screenRecordingTrusted: boolean;
  relaunchRecommended: boolean;
  hints: string[];
}

const App: React.FC = () => {
  const {
    setPermissions,
    permissions,
    addCapturedStep,
    manualBypass,
    setManualBypass,
    guide,
    guidePath,
    setGuide,
    validateGuide,
    setRecentGuides,
    isPaused,
    recaptureTarget,
    setRecaptureTarget,
    updateStep,
    removeStep,
    setActiveStep,
    setRecording,
  } = useStore();
  const [permissionDetails, setPermissionDetails] = React.useState<PermissionDetails | null>(null);
  const [showProcessing, setShowProcessing] = React.useState(false);
  const enrichingStepIds = useStore((s) => s.enrichingStepIds);
  const isRecording = useStore((s) => s.isRecording);
  const activeView = useStore((s) => s.activeView);

  const summarizeTypedText = (raw: string): string => {
    const normalized = raw.replace(/\s+/g, ' ').trim();
    if (normalized.length === 0) {
      return 'Enter text.';
    }
    const clipped = normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
    return `Type "${clipped}".`;
  };

  const mergeTypedInput = (prev: string, next: string): string => {
    if (!next) return prev;
    if (next === '*') return prev;
    if (next === '[backspace]') return prev.slice(0, -1);
    if (next === '\t') return `${prev} `;
    if (next === '\n') return `${prev}\n`;
    if (next.startsWith('[') && next.endsWith(']')) return prev;
    return `${prev}${next}`;
  };

  const shouldIgnorePlainKey = (data: RecorderEvent): boolean => {
    if (data.type !== 'keydown') return false;
    if (data.sensitiveInput) return false;
    const key = data.key ?? '';
    // Unknown/non-printable key events often arrive as "*"
    return key.length === 0 || key === '*';
  };

  const shortcutIntent = (data: RecorderEvent): { title: string; description: string } | null => {
    if (data.type !== 'keydown' || !data.key) return null;
    const key = data.key.toLowerCase();
    const mod = data.modifiers;
    if (!mod) return null;

    const primary = mod.meta || mod.ctrl;
    if (!primary || mod.alt) return null;

    const app = data.appName ?? 'the app';
    const appLower = app.toLowerCase();
    const isBrowser = ['chrome', 'safari', 'firefox', 'edge', 'brave', 'arc', 'opera'].some((name) =>
      appLower.includes(name),
    );
    const isWord = appLower.includes('word');
    const isExcel = appLower.includes('excel');
    const isPowerPoint = appLower.includes('powerpoint') || appLower.includes('power point');

    // Browser-specific shortcuts.
    if (isBrowser) {
      if (key === 't' && !mod.shift) {
        return { title: 'Open a new tab', description: `Use the keyboard shortcut in ${app} to open a new tab.` };
      }
      if (key === 'w' && !mod.shift) {
        return { title: 'Close the current tab', description: `Use the keyboard shortcut in ${app} to close the current tab.` };
      }
      if (key === 't' && mod.shift) {
        return {
          title: 'Reopen the last closed tab',
          description: `Use the keyboard shortcut in ${app} to restore the previous tab.`,
        };
      }
      if (key === 'l' && !mod.shift) {
        return { title: 'Focus the address bar', description: `Use the keyboard shortcut in ${app} to focus the URL bar.` };
      }
      if (key === 'r' && !mod.shift) {
        return { title: 'Refresh the page', description: `Use the keyboard shortcut in ${app} to refresh the current page.` };
      }
      if (key === 'n' && !mod.shift) {
        return { title: 'Open a new browser window', description: `Use the keyboard shortcut in ${app} to open a new browser window.` };
      }
    }

    // Word-specific.
    if (isWord) {
      if (key === 'n' && !mod.shift) return { title: 'Create a new Word document', description: `Use the keyboard shortcut in ${app} to create a new document.` };
      if (key === 's' && !mod.shift) return { title: 'Save the Word document', description: `Use the keyboard shortcut in ${app} to save the current document.` };
      if (key === 'p' && !mod.shift) return { title: 'Open Print in Word', description: `Use the keyboard shortcut in ${app} to open print options.` };
      if (key === 'f' && !mod.shift) return { title: 'Find text in Word', description: `Use the keyboard shortcut in ${app} to search within the document.` };
    }

    // Excel-specific.
    if (isExcel) {
      if (key === 'n' && !mod.shift) return { title: 'Create a new Excel workbook', description: `Use the keyboard shortcut in ${app} to create a new workbook.` };
      if (key === 's' && !mod.shift) return { title: 'Save the workbook', description: `Use the keyboard shortcut in ${app} to save the current workbook.` };
      if (key === 'f' && !mod.shift) return { title: 'Find data in Excel', description: `Use the keyboard shortcut in ${app} to search within the worksheet.` };
      if (key === 'p' && !mod.shift) return { title: 'Open Print in Excel', description: `Use the keyboard shortcut in ${app} to open print options.` };
    }

    // PowerPoint-specific.
    if (isPowerPoint) {
      if (key === 'm' && !mod.shift) return { title: 'Insert a new slide', description: `Use the keyboard shortcut in ${app} to insert a new slide.` };
      if (key === 'n' && mod.shift) return { title: 'Insert a new slide', description: `Use the keyboard shortcut in ${app} to insert a new slide.` };
      if (key === 's' && !mod.shift) return { title: 'Save the presentation', description: `Use the keyboard shortcut in ${app} to save the current presentation.` };
      if (key === 'f' && !mod.shift) return { title: 'Find text in PowerPoint', description: `Use the keyboard shortcut in ${app} to search within slides.` };
      if (key === 'p' && !mod.shift) return { title: 'Open Print in PowerPoint', description: `Use the keyboard shortcut in ${app} to open print options.` };
    }

    // Common app-wide shortcuts (lower priority than app-specific)
    if (key === 's' && !mod.shift) return { title: 'Save changes', description: `Use the keyboard shortcut in ${app} to save changes.` };
    if (key === 'f' && !mod.shift) return { title: 'Find', description: `Use the keyboard shortcut in ${app} to search.` };
    if (key === 'z' && !mod.shift) return { title: 'Undo', description: `Use the keyboard shortcut in ${app} to undo the previous action.` };
    if ((key === 'z' && mod.shift) || (key === 'y' && mod.ctrl && !mod.meta)) {
      return { title: 'Redo', description: `Use the keyboard shortcut in ${app} to redo the previous action.` };
    }
    if (key === 'c' && !mod.shift) return { title: 'Copy selection', description: `Use the keyboard shortcut in ${app} to copy the selected content.` };
    if (key === 'x' && !mod.shift) return { title: 'Cut selection', description: `Use the keyboard shortcut in ${app} to cut the selected content.` };
    if (key === 'v' && !mod.shift) return { title: 'Paste', description: `Use the keyboard shortcut in ${app} to paste content.` };
    if (key === 'a' && !mod.shift) return { title: 'Select all', description: `Use the keyboard shortcut in ${app} to select all content.` };

    return null;
  };

  const clickIntent = (data: RecorderEvent): { title: string; description: string } | null => {
    if (data.type !== 'click') return null;
    if (data.x === undefined || data.y === undefined || !data.region) return null;

    const { x, y } = data;
    const screenshotRegion = data.region;
    if (!screenshotRegion.width || !screenshotRegion.height) return null;

    const rx = (x - screenshotRegion.x) / screenshotRegion.width;
    const ry = (y - screenshotRegion.y) / screenshotRegion.height;
    if (rx < 0 || rx > 1 || ry < 0 || ry > 1) return null;

    const app = data.appName ?? 'the current app';
    const appLower = app.toLowerCase();
    const targetLabelRaw = (data.clickTargetLabel ?? '').trim();
    if (targetLabelRaw) {
      const [rawKind, ...rawLabelParts] = targetLabelRaw.split(':');
      const targetLabel = rawLabelParts.join(':').trim() || rawKind.trim();
      const kind = rawLabelParts.length > 0 ? rawKind.trim().toLowerCase() : 'element';
      const normalized = `${kind} ${targetLabel}`.toLowerCase();
      if (normalized.includes('new tab')) {
        return {
          title: 'Open a new tab',
          description: `Open a new tab in ${app}.`,
        };
      }
      if (normalized.includes('address bar') || normalized.includes('search bar') || normalized.includes('omnibox')) {
        return {
          title: 'Focus the address bar',
          description: `Click the address/search bar in ${app}.`,
        };
      }
      const quoted = targetLabel.replaceAll('"', "'");
      if (quoted.length >= 2) {
        const kindWord = kind === 'button' ? 'button' : kind === 'link' ? 'link' : 'element';
        return {
          title: `Click "${quoted}"`,
          description: `Click the ${kindWord} "${quoted}" in ${app}.`,
        };
      }
    }

    const isBrowser = ['chrome', 'safari', 'firefox', 'edge', 'brave', 'arc', 'opera'].some((name) =>
      appLower.includes(name),
    );
    const isWord = appLower.includes('word');
    const isExcel = appLower.includes('excel');
    const isPowerPoint = appLower.includes('powerpoint') || appLower.includes('power point');

    if (isBrowser) {
      if (ry < 0.12) {
        return {
          title: 'Open a new tab',
          description: `Use the browser tab bar in ${app} to open or select a new tab.`,
        };
      }
      if (ry >= 0.12 && ry < 0.24) {
        return {
          title: 'Focus the address bar',
          description: `Click the browser address/search bar in ${app}.`,
        };
      }
      return null;
    }

    if (isWord) {
      if (ry < 0.16) {
        return {
          title: 'Use a Word ribbon command',
          description: `Click a command in the ${app} ribbon.`,
        };
      }
      if (ry >= 0.18 && ry <= 0.92) {
        return {
          title: 'Edit document content',
          description: `Click within the document area in ${app}.`,
        };
      }
    }

    if (isExcel) {
      if (ry < 0.16) {
        return {
          title: 'Use an Excel ribbon command',
          description: `Click a command in the ${app} ribbon.`,
        };
      }
      if (ry > 0.9 && rx < 0.55) {
        return {
          title: 'Switch worksheet tab',
          description: `Click a worksheet tab in ${app}.`,
        };
      }
      if (ry >= 0.18 && ry <= 0.9) {
        return {
          title: 'Select a worksheet cell',
          description: `Click a cell in the worksheet in ${app}.`,
        };
      }
    }

    if (isPowerPoint) {
      if (ry < 0.16) {
        return {
          title: 'Use a PowerPoint ribbon command',
          description: `Click a command in the ${app} ribbon.`,
        };
      }
      if (rx < 0.24 && ry >= 0.16) {
        return {
          title: 'Select a slide thumbnail',
          description: `Click a slide in the thumbnail pane in ${app}.`,
        };
      }
      if (rx >= 0.24 && ry >= 0.16) {
        return {
          title: 'Edit slide content',
          description: `Click the slide canvas in ${app}.`,
        };
      }
    }

    return null;
  };

  useEffect(() => {
    let isMounted = true;

    const check = async () => {
      const res = (await window.ipcRenderer.invoke('check-permissions')) as {
        accessibility: boolean;
        screenRecording: boolean;
      };
      if (isMounted) {
        setPermissions(res);
        const details = (await window.ipcRenderer.invoke('permission-details')) as PermissionDetails;
        setPermissionDetails(details);
      }
      return res;
    };

    check();

    const interval = setInterval(async () => {
      const res = await check();
      if (res.accessibility && res.screenRecording) {
        clearInterval(interval);
      }
    }, 2000);

    const handleRecorderEvent = (_event: unknown, ...args: unknown[]) => {
      const data = args[0] as RecorderEvent;
      if (!data || typeof data !== 'object') {
        return;
      }

      const state = useStore.getState();

      // Suppress events while paused (unless in recapture mode)
      if (state.isPaused && !state.recaptureTarget) {
        return;
      }

      const appName = (data.appName ?? '').toLowerCase();
      if (appName.includes('stepcanvas')) {
        return;
      }

      // --- Recapture mode handling ---
      if (state.recaptureTarget) {
        const { stepId, strategy } = state.recaptureTarget;

        if (strategy === 'single') {
          // Replace only the target step's capture data
          const stepIndex = state.guide.steps.findIndex((s) => s.id === stepId);
          if (stepIndex >= 0) {
            state.updateStep(stepId, {
              screenshotPath: data.imagePath,
              screenshotFullPath: data.imageFullPath,
              screenshotRegion: data.region,
              x: data.x,
              y: data.y,
              appName: data.appName,
              windowTitle: data.windowTitle,
              currentUrl: data.currentUrl,
              clickTargetLabel: data.clickTargetLabel,
              timestamp: data.time,
            });
          }
          // Exit recapture mode and stop recording
          state.setRecaptureTarget(null);
          window.ipcRenderer.invoke('stop-recording');
          state.setRecording(false);
          state.setPaused(false);
          return;
        }

        if (strategy === 'from-here') {
          // On first event: remove all steps from target onward
          const targetIndex = state.guide.steps.findIndex((s) => s.id === stepId);
          if (targetIndex >= 0) {
            const stepsToRemove = state.guide.steps.slice(targetIndex);
            for (const step of stepsToRemove) {
              state.removeStep(step.id);
            }
            // Clear recapture target so subsequent events are normal captures
            state.setRecaptureTarget(null);
          }
          // Fall through to normal capture below
        }
      }

      const steps = useStore.getState().guide.steps;
      const previous = steps[steps.length - 1];

      const isDuplicateClick =
        data.type === 'click' &&
        previous?.type === 'click' &&
        previous.appName === data.appName &&
        previous.windowTitle === data.windowTitle &&
        previous.currentUrl === data.currentUrl &&
        previous.clickTargetLabel === data.clickTargetLabel &&
        Math.abs((previous.x ?? 0) - (data.x ?? 0)) < 12 &&
        Math.abs((previous.y ?? 0) - (data.y ?? 0)) < 12 &&
        data.time - previous.timestamp < 800;
      if (isDuplicateClick) {
        return;
      }

      if (
        data.type === 'keydown' &&
        previous?.type === 'keypress' &&
        previous.appName === data.appName &&
        previous.windowTitle === data.windowTitle &&
        data.time - previous.timestamp < 1200
      ) {
        const shortcut = shortcutIntent(data);
        if (shortcut) {
          const created = addCapturedStep({
            type: 'keypress',
            key: data.key,
            appName: data.appName,
            windowTitle: data.windowTitle,
            currentUrl: data.currentUrl,
            clickTargetLabel: data.clickTargetLabel,
            sensitiveInput: data.sensitiveInput,
            timestamp: data.time,
            screenshotPath: data.imagePath,
            screenshotFullPath: data.imageFullPath,
            screenshotRegion: data.region,
          });
          useStore.getState().updateStep(created.id, {
            title: created.title.replace(/: .+$/, `: ${shortcut.title}`),
            description: shortcut.description,
          });
          return;
        }

        // Ignore generic modifier combos unless they matched a known intent.
        if (data.modifiers && (data.modifiers.meta || data.modifiers.ctrl) && !data.sensitiveInput) {
          return;
        }

        if (shouldIgnorePlainKey(data)) {
          return;
        }

        const key = data.activeInputText && !data.sensitiveInput ? data.activeInputText : (data.key ?? '');
        const prevKey = previous.key ?? '';
        const mergedKey = data.activeInputText && !data.sensitiveInput ? key : mergeTypedInput(prevKey, key);
        const patch: {
          key: string;
          timestamp: number;
          description: string;
          screenshotPath?: string;
          screenshotFullPath?: string;
          screenshotRegion?: typeof previous.screenshotRegion;
        } = {
          key: mergedKey,
          timestamp: data.time,
          description: data.sensitiveInput ? 'Enter text in a sensitive field.' : summarizeTypedText(mergedKey),
        };
        if (!previous.screenshotPath) {
          const fallbackShot = [...steps]
            .reverse()
            .find((s) => s.screenshotPath && s.appName === data.appName && data.time - s.timestamp < 45000);
          if (fallbackShot?.screenshotPath) {
            patch.screenshotPath = fallbackShot.screenshotPath;
            patch.screenshotFullPath = fallbackShot.screenshotFullPath;
            patch.screenshotRegion = fallbackShot.screenshotRegion;
          }
        }
        useStore.getState().updateStep(previous.id, patch);
        return;
      }

      const keyContextStep =
        data.type === 'keydown'
          ? [...steps]
              .reverse()
              .find(
                (s) =>
                  s.type === 'click' &&
                  s.screenshotPath &&
                  s.appName === data.appName &&
                  s.windowTitle === data.windowTitle &&
                  data.time - s.timestamp < 15000,
              )
          : undefined;
      const keyContextFallbackStep =
        data.type === 'keydown' && !keyContextStep
          ? [...steps]
              .reverse()
              .find((s) => s.type === 'click' && s.screenshotPath && data.time - s.timestamp < 45000)
          : undefined;

      const created = addCapturedStep({
        type: data.type === 'keydown' ? 'keypress' : 'click',
        x: data.x,
        y: data.y,
        key: data.activeInputText && !data.sensitiveInput ? data.activeInputText : data.key,
        appName: data.appName,
        windowTitle: data.windowTitle,
        currentUrl: data.currentUrl,
        clickTargetLabel: data.clickTargetLabel,
        sensitiveInput: data.sensitiveInput,
        timestamp: data.time,
        screenshotPath: data.imagePath ?? keyContextStep?.screenshotPath ?? keyContextFallbackStep?.screenshotPath,
        screenshotFullPath: data.imageFullPath ?? keyContextStep?.screenshotFullPath ?? keyContextFallbackStep?.screenshotFullPath,
        screenshotRegion: data.region ?? keyContextStep?.screenshotRegion ?? keyContextFallbackStep?.screenshotRegion,
      });

      if (data.type === 'keydown') {
        const shortcut = shortcutIntent(data);
        if (shortcut) {
          useStore.getState().updateStep(created.id, {
            title: created.title.replace(/: .+$/, `: ${shortcut.title}`),
            description: shortcut.description,
          });
        } else if (shouldIgnorePlainKey(data)) {
          useStore.getState().removeStep(created.id);
        } else if (data.modifiers && (data.modifiers.meta || data.modifiers.ctrl) && !data.sensitiveInput) {
          // Drop non-semantic command/control keypress steps.
          useStore.getState().removeStep(created.id);
        }
      } else if (data.type === 'click') {
        const intent = clickIntent(data);
        if (intent) {
          useStore.getState().updateStep(created.id, {
            title: created.title.replace(/: .+$/, `: ${intent.title}`),
            description: intent.description,
          });
        }
      }

      // --- Async AI enrichment (non-blocking) ---
      const currentSettings = useStore.getState().guide.settings;
      const aiSettings = currentSettings.ai;
      if (aiSettings?.aiEnabled && aiSettings?.enrichOnCapture && !aiSettings?.localOnlyMode) {
        const stepForEnrich = useStore.getState().guide.steps.find((s) => s.id === created.id);
        if (stepForEnrich) {
          useStore.getState().setEnriching(created.id, true);
          window.ipcRenderer.invoke('ai-load-key').then((key) => {
            const allSteps = useStore.getState().guide.steps;
            const stepIdx = allSteps.findIndex((s) => s.id === created.id);
            const nearby = allSteps
              .slice(Math.max(0, stepIdx - 3), stepIdx + 4)
              .filter((s) => s.id !== created.id)
              .map((s) => s.title)
              .join('; ');
            return window.ipcRenderer.invoke('ai-enrich-step', {
              stepId: created.id,
              screenshotPath: stepForEnrich.screenshotPath,
              appName: stepForEnrich.appName,
              windowTitle: stepForEnrich.windowTitle,
              currentUrl: stepForEnrich.currentUrl,
              clickTargetLabel: stepForEnrich.clickTargetLabel,
              typedText: stepForEnrich.key,
              neighborContext: nearby,
              existingTitle: stepForEnrich.title,
              existingDescription: stepForEnrich.description,
              stepNumber: stepIdx + 1,
              totalSteps: allSteps.length,
              aiSettings: { ...aiSettings, openRouterApiKey: key as string },
            });
          }).then((result) => {
            useStore.getState().setEnriching(created.id, false);
            const proposal = result as import('../shared/types').StepProposal;
            if (proposal.status === 'ready') {
              useStore.getState().updateStep(created.id, { proposal });
            }
          }).catch(() => {
            useStore.getState().setEnriching(created.id, false);
          });
        }
      }
    };

    window.ipcRenderer.on('recorder-event', handleRecorderEvent);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.ipcRenderer.off('recorder-event', handleRecorderEvent);
    };
  }, [addCapturedStep, setPermissions, isPaused, recaptureTarget, updateStep, removeStep, setActiveStep, setRecording, setRecaptureTarget]);

  // Track recording stop: show processing overlay if AI enrichments are still running
  const wasRecordingRef = React.useRef(false);
  useEffect(() => {
    if (isRecording) {
      wasRecordingRef.current = true;
    } else if (wasRecordingRef.current) {
      wasRecordingRef.current = false;
      const aiEnabled = useStore.getState().guide.settings.ai?.aiEnabled;
      if (aiEnabled && enrichingStepIds.size > 0) {
        setShowProcessing(true);
      }
    }
  }, [isRecording, enrichingStepIds.size]);

  // Auto-dismiss processing overlay when all enrichments complete
  useEffect(() => {
    if (showProcessing && enrichingStepIds.size === 0) {
      const timer = setTimeout(() => setShowProcessing(false), 800);
      return () => clearTimeout(timer);
    }
  }, [showProcessing, enrichingStepIds.size]);

  useEffect(() => {
    const bootstrap = async () => {
      const loaded = await window.ipcRenderer.invoke('load-last-guide');
      if (loaded) {
        const response = loaded as { guide: GuideData; guidePath: string | null; recentGuides: string[] };
        setGuide(response.guide, response.guidePath);
        setRecentGuides(response.recentGuides);
      }
    };
    bootstrap();
  }, [setGuide, setRecentGuides]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      window.ipcRenderer.invoke('autosave-guide', { guide, guidePath });
    }, 300);
    return () => clearTimeout(timeout);
  }, [guide, guidePath]);

  const handleMarkReviewComplete = () => {
    const validation = validateGuide();
    if (!validation.ok) {
      window.alert(validation.message);
      return;
    }
    useStore.getState().setReviewCompleted(true);
  };

  if (!manualBypass && (!permissions.accessibility || !permissions.screenRecording)) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        textAlign: 'center',
        background: 'var(--bg-deep)'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '40px',
          borderRadius: '24px',
          border: '1px solid var(--border-glass)',
          maxWidth: '500px'
        }}>
          <ShieldAlert size={64} color={!permissions.accessibility ? "var(--danger)" : "var(--success)"} style={{ marginBottom: '24px' }} />
          <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>System Permissions Required</h2>

          <div style={{ textAlign: 'left', marginBottom: '24px', fontSize: '14px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span>Accessibility:</span>
              <span style={{ color: permissions.accessibility ? 'var(--success)' : 'var(--danger)' }}>
                {permissions.accessibility ? 'GRANTED' : 'DENIED'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Screen Recording:</span>
              <span style={{ color: permissions.screenRecording ? 'var(--success)' : 'var(--danger)' }}>
                {permissions.screenRecording ? 'GRANTED' : 'DENIED'}
              </span>
            </div>
            {permissionDetails && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-dim)' }}>
                <div>Raw Screen Status: {permissionDetails.screenRecordingStatus}</div>
                <div>Platform: {permissionDetails.platform}</div>
              </div>
            )}
          </div>

          <p style={{ color: 'var(--text-dim)', marginBottom: '32px' }}>
            MacOS Sequoia (15+) will likely <b>close the app</b> once you grant these permissions. This is normal! Re-open StepCanvas after approving.
            <br /><br />
            If they are already ON but show "DENIED", try toggling <b>StepCanvas</b> OFF and then ON again in System Settings.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              className="btn btn-primary"
              onClick={() => window.ipcRenderer.invoke('request-accessibility')}
              style={{ justifyContent: 'center', padding: '14px' }}
            >
              Request Accessibility Prompt
            </button>
            <button
              className="btn btn-outline"
              onClick={() => window.ipcRenderer.invoke('open-permission-settings', 'accessibility')}
              style={{ justifyContent: 'center' }}
            >
              Open Accessibility Settings
            </button>
            <button
              className="btn btn-outline"
              onClick={() => window.ipcRenderer.invoke('open-permission-settings', 'screen')}
              style={{ justifyContent: 'center' }}
            >
              Open Screen Recording Settings
            </button>
            <button
              className="btn btn-outline"
              onClick={async () => {
                const result = (await window.ipcRenderer.invoke('prime-screen-permission')) as
                  | { ok: true }
                  | { ok: false; reason?: string };
                if (!result.ok) {
                  window.alert(`Could not trigger screen capture probe. ${result.reason ?? ''}`.trim());
                } else {
                  window.alert(
                    'Screen capture probe completed. If StepCanvas is still missing from Screen Recording settings, fully restart StepCanvas and re-open the settings page.',
                  );
                }
              }}
              style={{ justifyContent: 'center' }}
            >
              Trigger Screen Capture Probe
            </button>
            <button
              className="btn btn-outline"
              onClick={async () => {
                const res = (await window.ipcRenderer.invoke('check-permissions')) as {
                  accessibility: boolean;
                  screenRecording: boolean;
                };
                setPermissions(res);
                const details = (await window.ipcRenderer.invoke('permission-details')) as PermissionDetails;
                setPermissionDetails(details);
              }}
              style={{ justifyContent: 'center' }}
            >
              Re-check Permissions
            </button>
            <button
              className="btn btn-outline"
              onClick={() => window.ipcRenderer.invoke('relaunch-app')}
              style={{ justifyContent: 'center' }}
            >
              Restart StepCanvas
            </button>
            {permissionDetails?.hints?.length ? (
              <div style={{ textAlign: 'left', fontSize: '12px', color: 'var(--text-dim)' }}>
                {permissionDetails.hints.map((hint) => (
                  <div key={hint}>- {hint}</div>
                ))}
                <div>- If StepCanvas is not listed, click "Trigger Screen Capture Probe" once, then restart StepCanvas.</div>
              </div>
            ) : null}
            <button
              className="btn btn-outline"
              onClick={() => setManualBypass(true)}
              style={{ justifyContent: 'center', fontSize: '12px', opacity: 0.6 }}
            >
              Bypass Check (If settings are verified ON)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const enrichingCount = enrichingStepIds.size;
  const totalSteps = guide.steps.length;
  const enrichedCount = totalSteps - enrichingCount;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar />
      <div className="main-content">
        <Header />
        <div style={{ padding: '8px 24px 0' }}>
          <button className="btn btn-outline" onClick={handleMarkReviewComplete}>
            Mark Review Complete
          </button>
        </div>
        {activeView?.type === 'coverPage' ? <CoverPageEditor /> : <StepEditor />}
      </div>

      {showProcessing && (
        <div className="settings-overlay" style={{ zIndex: 2000 }}>
          <div style={{
            background: '#0e0f24',
            border: '1px solid var(--border-glass)',
            borderRadius: '20px',
            padding: '48px 56px',
            textAlign: 'center',
            maxWidth: '440px',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
            animation: 'scaleIn 0.15s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              {enrichingCount > 0 ? (
                <Loader2 size={48} className="spin" style={{ color: '#a855f7' }} />
              ) : (
                <Sparkles size={48} style={{ color: '#22c55e' }} />
              )}
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 700 }}>
              {enrichingCount > 0 ? 'Processing with AI...' : 'Processing Complete'}
            </h2>
            <p style={{ margin: '0 0 24px', color: 'var(--text-dim)', fontSize: '14px' }}>
              {enrichingCount > 0
                ? `Enriching ${enrichingCount} step${enrichingCount !== 1 ? 's' : ''} with AI. This won't take long.`
                : 'All steps have been processed. Review the AI suggestions on each step.'}
            </p>
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
              height: '8px',
              overflow: 'hidden',
              marginBottom: '16px',
            }}>
              <div style={{
                height: '100%',
                width: totalSteps > 0 ? `${(enrichedCount / totalSteps) * 100}%` : '100%',
                background: 'linear-gradient(90deg, #a855f7, #6366f1)',
                borderRadius: '10px',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '20px' }}>
              {enrichedCount} / {totalSteps} steps ready
            </div>
            {enrichingCount === 0 && (
              <button
                className="btn btn-primary"
                style={{ padding: '10px 32px', fontSize: '14px' }}
                onClick={() => setShowProcessing(false)}
              >
                Review Steps
              </button>
            )}
            {enrichingCount > 0 && (
              <button
                className="btn btn-outline"
                style={{ padding: '8px 24px', fontSize: '12px', opacity: 0.7 }}
                onClick={() => setShowProcessing(false)}
              >
                Skip — review later
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
