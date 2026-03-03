import { uIOhook } from 'uiohook-napi';
import { BrowserWindow, screen } from 'electron';
import { execFile } from 'node:child_process';
import { captureScreenshot } from './screenshot';
import { checkPermissions } from './permissions';
import type { RecorderConfig } from '../shared/types';

let isHookActive = false;
let recorderConfig: RecorderConfig = {
  screenshotMode: 'snippet',
  screenshotWidth: 800,
  screenshotHeight: 600,
  imageQuality: 85,
  maskKeystrokes: false,
  excludedApps: [],
  namingMode: 'hybrid',
};
let lastContext:
  | {
      appName?: string;
      windowTitle?: string;
      currentUrl?: string;
      clickTargetLabel?: string;
      sensitiveInput?: boolean;
      activeInputText?: string;
      capturedAt: number;
    }
  | null = null;

let contextWarningShown = false;

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        if (!contextWarningShown) {
          console.warn('AppleScript context capture failed:', stderr || error.message);
          contextWarningShown = true;
        }
        resolve('');
        return;
      }
      resolve((stdout ?? '').trim());
    });
  });
}

function runShellCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 2000 }, (error, stdout) => {
      if (error) {
        resolve('');
        return;
      }
      resolve((stdout ?? '').trim());
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFrontAppFallback(): Promise<string> {
  const direct = await runAppleScript(`
try
  tell application "System Events"
    return name of first application process whose frontmost is true
  end tell
on error
  return ""
end try
`);
  if (direct) return direct;

  const front = await runShellCommand('/usr/bin/lsappinfo', ['front']);
  const asnMatch = front.match(/ASN:[^\s]+/);
  if (!asnMatch) return '';
  const asn = asnMatch[0];
  const info = await runShellCommand('/usr/bin/lsappinfo', ['info', '-only', 'name', asn]);
  const nameMatch = info.match(/"name"\s*=\s*"([^"]+)"/);
  return nameMatch?.[1] ?? '';
}

async function getBrowserClickTargetLabel(frontApp: string, clickPoint?: { x: number; y: number }): Promise<string | undefined> {
  const clickX = clickPoint?.x ?? -1;
  const clickY = clickPoint?.y ?? -1;
  const js =
    `(()=>{try{const CLICK_X=${clickX};const CLICK_Y=${clickY};const toLabel=(el)=>{if(!el)return'';const tag=(el.tagName||'').toLowerCase();const role=(el.getAttribute&&el.getAttribute('role'))||'';const aria=(el.getAttribute&&el.getAttribute('aria-label'))||'';const title=(el.getAttribute&&el.getAttribute('title'))||'';const value=(typeof el.value==='string'?el.value:'');const text=(el.innerText||el.textContent||'');const lbl=(aria||title||value||text||'').replace(/\\s+/g,' ').trim().slice(0,120);if(!lbl)return'';if(role==='button'||tag==='button')return'button:'+lbl;if(tag==='a')return'link:'+lbl;if(tag==='input'||tag==='textarea')return'field:'+lbl;return(tag||'element')+':'+lbl;};const nearest=(el)=>{if(!(el instanceof Element))return null;return el.closest('button,a,[role="button"],[aria-label],[title],input,textarea,[data-testid],nav li,li');};if(!window.__stepcanvasHooked){window.__stepcanvasHooked=true;window.__stepcanvasLastClick='';window.addEventListener('click',(ev)=>{try{const raw=ev.target instanceof Element?ev.target:null;const el=nearest(raw)||raw;const lbl=toLabel(el);if(lbl)window.__stepcanvasLastClick=String(Date.now())+'|'+lbl;}catch{}},true);}if(Number.isFinite(CLICK_X)&&Number.isFinite(CLICK_Y)&&CLICK_X>=0&&CLICK_Y>=0){const chromeY=CLICK_Y-window.screenY;const chromeHeight=Math.max(0,window.outerHeight-window.innerHeight);const viewportY=chromeY-chromeHeight;const viewportX=CLICK_X-window.screenX;if(viewportY>=0&&viewportX>=0&&viewportX<=window.innerWidth&&viewportY<=window.innerHeight){const raw=document.elementFromPoint(viewportX,viewportY);const el=nearest(raw)||raw;const lbl=toLabel(el);if(lbl)return lbl;}else if(chromeY>=0&&chromeY<55){return 'browser:new tab';}else if(chromeY>=55&&chromeY<110){return 'browser:address bar';}}const now=Date.now();if(typeof window.__stepcanvasLastClick==='string'&&window.__stepcanvasLastClick){const parts=window.__stepcanvasLastClick.split('|');const ts=Number(parts[0]);const lbl=parts.slice(1).join('|');if(lbl&&Number.isFinite(ts)&&now-ts<5000)return lbl;}const h=Array.from(document.querySelectorAll(':hover')).slice(-1)[0];const a=document.activeElement&&document.activeElement!==document.body?document.activeElement:null;return toLabel(nearest(a)||a)||toLabel(nearest(h)||h)||'';}catch{return'';}})();`;

  let script = '';
  if (frontApp === 'Google Chrome') {
    script = `tell application "Google Chrome" to if (count of windows) > 0 then return execute active tab of front window javascript "${js}"`;
  } else if (frontApp === 'Safari') {
    script = `tell application "Safari" to if (count of windows) > 0 then return do JavaScript "${js}" in current tab of front window`;
  } else if (frontApp === 'Microsoft Edge') {
    script = `tell application "Microsoft Edge" to if (count of windows) > 0 then return execute active tab of front window javascript "${js}"`;
  } else if (frontApp === 'Brave Browser') {
    script = `tell application "Brave Browser" to if (count of windows) > 0 then return execute active tab of front window javascript "${js}"`;
  } else if (frontApp === 'Arc') {
    script = `tell application "Arc" to if (count of windows) > 0 then return execute active tab of front window javascript "${js}"`;
  } else {
    return undefined;
  }

  let result = await runAppleScript(script);
  if (!result) {
    await sleep(45);
    result = await runAppleScript(script);
  }
  return result || undefined;
}

async function getActiveContext(clickPoint?: { x: number; y: number }): Promise<{
  appName?: string;
  windowTitle?: string;
  currentUrl?: string;
  clickTargetLabel?: string;
  sensitiveInput?: boolean;
  activeInputText?: string;
}> {
  if (process.platform !== 'darwin') {
    return {};
  }
  const jsFieldProbe =
    "(()=>{try{const el=document.activeElement;if(!el)return JSON.stringify({sensitive:false,value:''});const isEditable=el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable===true;if(!isEditable)return JSON.stringify({sensitive:false,value:''});const type=((el.type||'')+'').toLowerCase();const meta=[el.name||'',el.id||'',(el.getAttribute&&el.getAttribute('autocomplete'))||'',(el.getAttribute&&el.getAttribute('aria-label'))||''].join(' ').toLowerCase();const sensitive=type==='password'||/(user(name)?|email|login|pass(word)?|otp|two-factor|verification)/.test(meta);let value='';if(!sensitive){if(el.isContentEditable===true){value=(el.textContent||'')+'';}else{value=(el.value||'')+'';}}value=value.replace(/\\s+/g,' ').trim().slice(0,240);return JSON.stringify({sensitive,value});}catch{return JSON.stringify({sensitive:false,value:''});}})();";
  const script = `
set frontApp to ""
set frontWindowTitle to ""
set frontUrl to ""
set fieldProbe to "unknown"
try
  tell application "System Events"
    set frontApp to name of first application process whose frontmost is true
  end tell
end try
try
  tell application "System Events"
    tell process frontApp
      if (count of windows) > 0 then set frontWindowTitle to name of front window
    end tell
  end tell
end try
try
  if frontApp is "Google Chrome" then
    tell application "Google Chrome"
      if (count of windows) > 0 then
        set frontUrl to URL of active tab of front window
        set fieldProbe to execute active tab of front window javascript "${jsFieldProbe}"
      end if
    end tell
  else if frontApp is "Safari" then
    tell application "Safari"
      if (count of windows) > 0 then
        set frontUrl to URL of current tab of front window
        set fieldProbe to do JavaScript "${jsFieldProbe}" in current tab of front window
      end if
    end tell
  else if frontApp is "Microsoft Edge" then
    tell application "Microsoft Edge"
      if (count of windows) > 0 then
        set frontUrl to URL of active tab of front window
        set fieldProbe to execute active tab of front window javascript "${jsFieldProbe}"
      end if
    end tell
  else if frontApp is "Brave Browser" then
    tell application "Brave Browser"
      if (count of windows) > 0 then
        set frontUrl to URL of active tab of front window
        set fieldProbe to execute active tab of front window javascript "${jsFieldProbe}"
      end if
    end tell
  end if
end try
return frontApp & tab & frontWindowTitle & tab & frontUrl & tab & fieldProbe
`;
  const result = await runAppleScript(script);
  const [appName, windowTitle, currentUrl, fieldProbe] = result.split('\t');
  let sensitiveInput = fieldProbe === 'sensitive';
  let activeInputText: string | undefined;
  if (fieldProbe && fieldProbe.startsWith('{')) {
    try {
      const parsed = JSON.parse(fieldProbe) as { sensitive?: boolean; value?: string };
      sensitiveInput = Boolean(parsed.sensitive);
      if (!sensitiveInput && typeof parsed.value === 'string' && parsed.value.trim().length > 0) {
        activeInputText = parsed.value.trim();
      }
    } catch {
      // Keep fallback values.
    }
  }

  // If AppleScript couldn't get the app name (Accessibility not granted), try fallback
  if (!appName) {
    const fallbackApp = await getFrontAppFallback();
    if (fallbackApp) {
      console.log('Using lsappinfo fallback for app context:', fallbackApp);
      const clickTargetLabel = clickPoint ? await getBrowserClickTargetLabel(fallbackApp, clickPoint) : undefined;
      return { appName: fallbackApp, clickTargetLabel, activeInputText };
    }
    return {};
  }

  const clickTargetLabel = clickPoint && appName ? await getBrowserClickTargetLabel(appName, clickPoint) : undefined;

  return {
    appName: appName || undefined,
    windowTitle: windowTitle || undefined,
    currentUrl: currentUrl || undefined,
    clickTargetLabel: clickTargetLabel || undefined,
    sensitiveInput,
    activeInputText,
  };
}

async function getActiveContextCached(maxAgeMs = 250): Promise<{
  appName?: string;
  windowTitle?: string;
  currentUrl?: string;
  clickTargetLabel?: string;
  sensitiveInput?: boolean;
  activeInputText?: string;
}> {
  if (lastContext && Date.now() - lastContext.capturedAt < maxAgeMs) {
    return {
      appName: lastContext.appName,
      windowTitle: lastContext.windowTitle,
      currentUrl: lastContext.currentUrl,
      clickTargetLabel: lastContext.clickTargetLabel,
      sensitiveInput: lastContext.sensitiveInput,
      activeInputText: lastContext.activeInputText,
    };
  }
  const fresh = await getActiveContext();
  lastContext = { ...fresh, capturedAt: Date.now() };
  return fresh;
}

const MODIFIER_KEYCODES = {
  shift: new Set([42, 54]),
  ctrl: new Set([29, 3613]),
  alt: new Set([56, 3640]),
  meta: new Set([3675, 3676]),
};

function isModifierKeycode(code: number): boolean {
  return (
    MODIFIER_KEYCODES.shift.has(code) ||
    MODIFIER_KEYCODES.ctrl.has(code) ||
    MODIFIER_KEYCODES.alt.has(code) ||
    MODIFIER_KEYCODES.meta.has(code)
  );
}

function keyFromEvent(e: { keycode: number; keychar?: number }): string {
  if (e.keycode === 14) return '[backspace]';
  if (e.keycode === 15) return '\t';
  if (e.keycode === 28 || e.keycode === 3612) return '\n';
  if (e.keycode === 57) return ' ';

  if (typeof e.keychar === 'number' && e.keychar >= 32 && e.keychar <= 126) {
    return String.fromCharCode(e.keychar);
  }

  // Fallback for common US-layout keycodes when keychar isn't populated.
  const keycodeMap: Record<number, string> = {
    2: '1',
    3: '2',
    4: '3',
    5: '4',
    6: '5',
    7: '6',
    8: '7',
    9: '8',
    10: '9',
    11: '0',
    12: '-',
    13: '=',
    16: 'q',
    17: 'w',
    18: 'e',
    19: 'r',
    20: 't',
    21: 'y',
    22: 'u',
    23: 'i',
    24: 'o',
    25: 'p',
    26: '[',
    27: ']',
    30: 'a',
    31: 's',
    32: 'd',
    33: 'f',
    34: 'g',
    35: 'h',
    36: 'j',
    37: 'k',
    38: 'l',
    39: ';',
    40: "'",
    41: '`',
    43: '\\',
    44: 'z',
    45: 'x',
    46: 'c',
    47: 'v',
    48: 'b',
    49: 'n',
    50: 'm',
    51: ',',
    52: '.',
    53: '/',
  };
  if (keycodeMap[e.keycode]) {
    return keycodeMap[e.keycode];
  }

  // Avoid layout-dependent fallback mapping beyond known safe keys.
  return '*';
}

async function captureForMode(
  _mode: RecorderConfig['screenshotMode'],
  x: number,
  y: number,
  config: RecorderConfig,
): Promise<{ imagePath?: string; imageFullPath?: string; region?: import('../shared/types').CaptureRegion }> {
  const opts = { width: config.screenshotWidth, height: config.screenshotHeight, quality: config.imageQuality };
  // Always capture both snippet and full screen so the user can toggle between them.
  const [snippet, full] = await Promise.all([
    captureScreenshot(x, y, undefined, { ...opts, mode: 'snippet' }),
    captureScreenshot(x, y, undefined, { ...opts, mode: 'fullscreen' }),
  ]);
  return { imagePath: snippet.path, imageFullPath: full.path, region: snippet.region };
}

export async function startRecording(win: BrowserWindow, config?: Partial<RecorderConfig>) {
    console.log('Attempting to start recording...');
    recorderConfig = {
      ...recorderConfig,
      ...config,
    };

    const perms = checkPermissions();
    if (!perms.accessibility) {
        console.error('Cannot start recorder: Accessibility permission missing.');
        return { ok: false, reason: 'Accessibility permission missing.' };
    }

    if (isHookActive) {
        console.log('Hook already active, stopping first for clean start.');
        try {
            uIOhook.stop();
            uIOhook.removeAllListeners();
        } catch (e) {
            console.warn('Cleanup before start failed (expected if already stopped):', e);
        }
        isHookActive = false;
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    try {
        const pressedModifiers = new Set<'meta' | 'ctrl' | 'alt' | 'shift'>();

        uIOhook.on('keyup', (e) => {
          if (MODIFIER_KEYCODES.meta.has(e.keycode)) pressedModifiers.delete('meta');
          if (MODIFIER_KEYCODES.ctrl.has(e.keycode)) pressedModifiers.delete('ctrl');
          if (MODIFIER_KEYCODES.alt.has(e.keycode)) pressedModifiers.delete('alt');
          if (MODIFIER_KEYCODES.shift.has(e.keycode)) pressedModifiers.delete('shift');
        });

        uIOhook.on('mouseup', async () => {
            const point = screen.getCursorScreenPoint();
            try {
                // Wait a beat so browser click handlers run before DOM label probe.
                await sleep(50);
                const contextPromise = getActiveContext({ x: point.x, y: point.y });
                const [capture, context] = await Promise.all([
                  captureForMode(recorderConfig.screenshotMode, point.x, point.y, recorderConfig),
                  contextPromise,
                ]);
                if (win && !win.isDestroyed()) {
                    win.webContents.send('recorder-event', {
                        type: 'click',
                        x: point.x,
                        y: point.y,
                        time: Date.now(),
                        imagePath: capture.imagePath,
                        imageFullPath: capture.imageFullPath,
                        region: capture.region,
                        appName: context.appName,
                        windowTitle: context.windowTitle,
                        currentUrl: context.currentUrl,
                        clickTargetLabel: context.clickTargetLabel,
                        sensitiveInput: context.sensitiveInput,
                    });
                }
            } catch (err) {
                console.error('Failed to capture screenshot during click:', err);
                const context = await getActiveContext({ x: point.x, y: point.y });
                if (win && !win.isDestroyed()) {
                  win.webContents.send('recorder-event', {
                    type: 'click',
                    x: point.x,
                    y: point.y,
                    time: Date.now(),
                    appName: context.appName,
                    windowTitle: context.windowTitle,
                    currentUrl: context.currentUrl,
                    clickTargetLabel: context.clickTargetLabel,
                    sensitiveInput: context.sensitiveInput,
                  });
                }
            }
        });

        uIOhook.on('keydown', async (e) => {
          if (MODIFIER_KEYCODES.meta.has(e.keycode)) pressedModifiers.add('meta');
          if (MODIFIER_KEYCODES.ctrl.has(e.keycode)) pressedModifiers.add('ctrl');
          if (MODIFIER_KEYCODES.alt.has(e.keycode)) pressedModifiers.add('alt');
          if (MODIFIER_KEYCODES.shift.has(e.keycode)) pressedModifiers.add('shift');

          // Don't emit standalone modifier key presses as text steps.
          if (isModifierKeycode(e.keycode)) {
            return;
          }

          await sleep(20);
          const context = await getActiveContextCached(0);
          if (win && !win.isDestroyed()) {
            const key = recorderConfig.maskKeystrokes || context.sensitiveInput ? '*' : keyFromEvent(e as { keycode: number; keychar?: number });
            win.webContents.send('recorder-event', {
              type: 'keydown',
              key,
              keycode: e.keycode,
              modifiers: {
                meta: pressedModifiers.has('meta'),
                ctrl: pressedModifiers.has('ctrl'),
                alt: pressedModifiers.has('alt'),
                shift: pressedModifiers.has('shift'),
              },
              time: Date.now(),
              appName: context.appName,
              windowTitle: context.windowTitle,
              currentUrl: context.currentUrl,
              sensitiveInput: context.sensitiveInput,
              activeInputText: context.activeInputText,
            });
          }
        });

        uIOhook.start();
        isHookActive = true;
        console.log('Recording hook successfully started.');
        return { ok: true };
    } catch (err) {
        console.error('CRITICAL: Failed to start uIOhook natively:', err);
        isHookActive = false;
        return { ok: false, reason: 'Failed to start native input hook.' };
    }
}

export function stopRecording() {
    if (!isHookActive) return;

    console.log('Stopping recording hook...');
    try {
        uIOhook.stop();
        uIOhook.removeAllListeners();
        isHookActive = false;
        console.log('Recording hook stopped.');
    } catch (err) {
        console.error('Failed to stop recorder hook gracefully:', err);
    }
}
