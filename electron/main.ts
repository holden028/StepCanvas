import { app, BrowserWindow, dialog, ipcMain, protocol, net, shell, desktopCapturer, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkPermissions, getPermissionDetails, permissionDiagnostics, requestAccessibility } from './permissions';
import { startRecording, stopRecording } from './recorder';
import type { AISettings, ExportFormat, GuideData, RecorderConfig } from '../shared/types';
import { createEmptyGuide } from '../shared/defaults';
import { chooseGuideForSave, chooseGuideToOpen, loadLastGuide, readGuide, saveLastGuidePath, writeGuide } from './guideStore';
import { exportGuide } from './export/service';
import { saveApiKey, loadApiKey, clearApiKey, hasApiKey } from './ai/keyStore';
import { enrichStep } from './ai/enrichmentQueue';
import { runLocalOcr } from './ai/ocr';
import { callOpenRouter, parseJsonFromLlm } from './ai/openRouterClient';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null = null;

// Register custom protocol for local assets (screenshots)
protocol.registerSchemesAsPrivileged([
    { scheme: 'local-asset', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

function setupIpc() {
    ipcMain.handle('check-permissions', () => {
        return checkPermissions();
    });

    ipcMain.handle('request-accessibility', () => {
        requestAccessibility();
        return checkPermissions();
    });
    ipcMain.handle('permission-diagnostics', () => permissionDiagnostics());
    ipcMain.handle('permission-details', () => getPermissionDetails());
    ipcMain.handle('open-permission-settings', async (_event, target: 'accessibility' | 'screen') => {
        if (process.platform !== 'darwin') {
          return false;
        }
        const url =
          target === 'accessibility'
            ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
            : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
        await shell.openExternal(url);
        return true;
    });
    ipcMain.handle('relaunch-app', () => {
      app.relaunch();
      app.exit(0);
    });
    ipcMain.handle('prime-screen-permission', async () => {
      try {
        const display = screen.getPrimaryDisplay();
        await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: Math.max(1, Math.min(128, display.size.width)),
            height: Math.max(1, Math.min(128, display.size.height)),
          },
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : 'Unknown error while probing screen capture.',
        };
      }
    });

    ipcMain.handle('start-recording', async (_event, config?: Partial<RecorderConfig>) => {
        if (win) {
            return startRecording(win, config);
        }
        return { ok: false, reason: 'Main window is not available.' };
    });

    ipcMain.handle('stop-recording', () => {
        stopRecording();
    });

    ipcMain.handle('save-guide', async (_event, data: { guide: GuideData; guidePath: string | null }) => {
        if (!win) return null;
        const targetDir = data.guidePath ?? (await chooseGuideForSave(win));
        if (!targetDir) {
            return null;
        }
        writeGuide(targetDir, data.guide);
        const recent = [targetDir, ...loadLastGuide().recentGuides.filter((p) => p !== targetDir)].slice(0, 10);
        saveLastGuidePath(targetDir, recent);
        return { guidePath: targetDir, recentGuides: recent };
    });

    ipcMain.handle('autosave-guide', (_event, data: { guide: GuideData; guidePath: string | null }) => {
        if (!data.guidePath) {
            return;
        }
        writeGuide(data.guidePath, data.guide);
    });

    ipcMain.handle('open-guide', async () => {
        if (!win) return null;
        const guideDir = await chooseGuideToOpen(win);
        if (!guideDir) return null;
        const guide = readGuide(guideDir);
        const recent = [guideDir, ...loadLastGuide().recentGuides.filter((p) => p !== guideDir)].slice(0, 10);
        saveLastGuidePath(guideDir, recent);
        return { guide, guidePath: guideDir, recentGuides: recent };
    });

    ipcMain.handle('new-guide', () => createEmptyGuide());

    ipcMain.handle('load-last-guide', () => loadLastGuide());

    ipcMain.handle('export-guide', async (_event, data: { guide: GuideData; format: ExportFormat }) => {
        if (!win) return false;
        return exportGuide(win, data.guide, data.format);
    });
    ipcMain.handle('read-image-data-url', (_event, imagePath: string) => {
      try {
        if (!imagePath || !path.isAbsolute(imagePath) || !fs.existsSync(imagePath)) {
          return null;
        }
        const ext = path.extname(imagePath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const base64 = fs.readFileSync(imagePath, 'base64');
        return `data:${mime};base64,${base64}`;
      } catch {
        return null;
      }
    });

    // --- AI key management ---
    ipcMain.handle('ai-save-key', (_event, key: string) => {
      saveApiKey(key);
      return { ok: true };
    });
    ipcMain.handle('ai-load-key', () => loadApiKey());
    ipcMain.handle('ai-clear-key', () => {
      clearApiKey();
      return { ok: true };
    });
    ipcMain.handle('ai-has-key', () => hasApiKey());

    ipcMain.handle('ai-fetch-models', async (_event, apiKey?: string) => {
      const key = apiKey || loadApiKey();
      if (!key) return { ok: false, models: [], error: 'No API key.' };
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            Authorization: `Bearer ${key}`,
            'HTTP-Referer': 'https://stepcanvas.app',
            'X-Title': 'StepCanvas',
          },
        });
        if (!res.ok) {
          return { ok: false, models: [], error: `HTTP ${res.status}` };
        }
        const json = (await res.json()) as {
          data: {
            id: string;
            name: string;
            pricing: { prompt: string; completion: string };
            architecture: { input_modalities: string[] };
            context_length: number;
          }[];
        };
        const models = (json.data ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          promptPrice: Number(m.pricing?.prompt ?? 0),
          completionPrice: Number(m.pricing?.completion ?? 0),
          isFree: Number(m.pricing?.prompt ?? 0) === 0 && Number(m.pricing?.completion ?? 0) === 0,
          supportsVision: (m.architecture?.input_modalities ?? []).includes('image'),
          contextLength: m.context_length ?? 0,
        }));
        return { ok: true, models };
      } catch (err) {
        return { ok: false, models: [], error: err instanceof Error ? err.message : 'Unknown error.' };
      }
    });

    // --- OCR ---
    ipcMain.handle('run-ocr', async (_event, imagePath: string) => {
      return runLocalOcr(imagePath);
    });

    // --- AI enrichment ---
    ipcMain.handle('ai-enrich-step', async (_event, data: {
      stepId: string;
      screenshotPath?: string;
      appName?: string;
      windowTitle?: string;
      currentUrl?: string;
      clickTargetLabel?: string;
      typedText?: string;
      ocrText?: string;
      neighborContext?: string;
      aiSettings: AISettings;
    }) => {
      return enrichStep(data);
    });

    // --- AI cover page generation ---
    ipcMain.handle('ai-generate-cover', async (_event, data: {
      steps: { title: string; description: string; appName?: string; currentUrl?: string }[];
      guideTitle: string;
      branding: { brandName: string; authorName: string; authorRole: string; purposeSummary: string };
      aiSettings: AISettings;
    }) => {
      try {
        const stepSummary = data.steps
          .map((s, i) => `${i + 1}. ${s.title}${s.description ? ` — ${s.description}` : ''}`)
          .join('\n');

        const appsUsed = [...new Set(data.steps.map((s) => s.appName).filter(Boolean))].join(', ');
        const urlsVisited = [...new Set(data.steps.map((s) => s.currentUrl).filter(Boolean))].slice(0, 10).join(', ');

        const systemPrompt = `You are a technical writer generating a professional cover page for a step-by-step guide document.
Given information about the guide's steps, the applications used, and branding details, generate:
1. A polished document title (concise, professional, descriptive of the task)
2. A purpose summary (2-3 sentences explaining what the guide covers and who it's for)
3. A list of 3-5 key highlights or learning outcomes from this guide

Respond ONLY with valid JSON matching this schema:
{
  "title": "string",
  "purposeSummary": "string",
  "highlights": ["string", "string", ...]
}`;

        const userPrompt = `Guide information:
- Current title: "${data.guideTitle}"
- Total steps: ${data.steps.length}
- Applications used: ${appsUsed || 'Various'}
- URLs visited: ${urlsVisited || 'None'}
${data.branding.brandName ? `- Organisation: ${data.branding.brandName}` : ''}
${data.branding.authorName ? `- Author: ${data.branding.authorName}${data.branding.authorRole ? ` (${data.branding.authorRole})` : ''}` : ''}
${data.branding.purposeSummary ? `- Existing summary: ${data.branding.purposeSummary}` : ''}

Steps in this guide:
${stepSummary}

Generate a professional cover page for this guide.`;

        const raw = await callOpenRouter(data.aiSettings, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]);

        const parsed = parseJsonFromLlm<{
          title: string;
          purposeSummary: string;
          highlights: string[];
        }>(raw);

        return { ok: true, ...parsed };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Unknown error.' };
      }
    });

    // --- AI background generation ---
    ipcMain.handle('ai-generate-background', async (_event, data: {
      brandName: string;
      primaryColor: string;
      purposeSummary: string;
      aiSettings: AISettings;
    }) => {
      try {
        const systemPrompt = `You are a graphic designer creating a professional cover page background for a document.
Given branding details, generate a design specification as JSON.
The background should be elegant, professional, and subtle enough for text to be readable on top.
Think: corporate/enterprise documents, training materials, professional guides.

Respond ONLY with valid JSON matching this schema:
{
  "color1": "#hex (gradient start, derived from brand color)",
  "color2": "#hex (gradient end, complementary tone)",
  "color3": "#hex (accent for decorative elements)",
  "gradientAngle": number (degrees, 0-360),
  "pattern": "circles" | "dots" | "waves" | "diagonal-lines" | "mesh" | "none",
  "patternOpacity": number (0.02-0.15, keep subtle),
  "accentShapes": number (0-6, number of decorative circles/blobs)
}`;

        const userPrompt = `Brand: ${data.brandName || 'Professional document'}
Primary colour: ${data.primaryColor || '#2563eb'}
Purpose: ${data.purposeSummary || 'A step-by-step guide'}

Design a sophisticated, modern background that uses these brand colours. Keep it subtle and professional.`;

        const raw = await callOpenRouter(data.aiSettings, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]);

        const design = parseJsonFromLlm<{
          color1: string;
          color2: string;
          color3: string;
          gradientAngle: number;
          pattern: string;
          patternOpacity: number;
          accentShapes: number;
        }>(raw);

        const W = 1920;
        const H = 1080;
        const c1 = design.color1 || data.primaryColor || '#2563eb';
        const c2 = design.color2 || '#f0f4ff';
        const c3 = design.color3 || c1;
        const angle = design.gradientAngle ?? 135;
        const opacity = Math.min(0.15, Math.max(0.02, design.patternOpacity ?? 0.06));
        const shapes = Math.min(6, Math.max(0, design.accentShapes ?? 3));

        const rad = (angle * Math.PI) / 180;
        const x2Pct = Math.round(50 + 50 * Math.cos(rad));
        const y2Pct = Math.round(50 + 50 * Math.sin(rad));

        let patternDef = '';
        let patternFill = '';
        const p = design.pattern || 'none';
        if (p === 'circles' || p === 'dots') {
          patternDef = `<pattern id="p" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
            <circle cx="30" cy="30" r="${p === 'dots' ? 3 : 12}" fill="${c3}" opacity="${opacity}" />
          </pattern>`;
          patternFill = `<rect width="${W}" height="${H}" fill="url(#p)" />`;
        } else if (p === 'waves') {
          patternDef = `<pattern id="p" x="0" y="0" width="200" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 20 Q50 0 100 20 Q150 40 200 20" fill="none" stroke="${c3}" stroke-width="1.5" opacity="${opacity}" />
          </pattern>`;
          patternFill = `<rect width="${W}" height="${H}" fill="url(#p)" />`;
        } else if (p === 'diagonal-lines') {
          patternDef = `<pattern id="p" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="20" stroke="${c3}" stroke-width="1" opacity="${opacity}" />
          </pattern>`;
          patternFill = `<rect width="${W}" height="${H}" fill="url(#p)" />`;
        } else if (p === 'mesh') {
          patternDef = `<pattern id="p" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 0 L40 0 L40 40 L0 40 Z" fill="none" stroke="${c3}" stroke-width="0.5" opacity="${opacity}" />
          </pattern>`;
          patternFill = `<rect width="${W}" height="${H}" fill="url(#p)" />`;
        }

        let accentSvg = '';
        for (let i = 0; i < shapes; i++) {
          const cx = Math.round(Math.random() * W);
          const cy = Math.round(Math.random() * H);
          const r = 80 + Math.round(Math.random() * 200);
          const o = (0.03 + Math.random() * 0.08).toFixed(3);
          const fill = i % 2 === 0 ? c1 : c3;
          accentSvg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${o}" />`;
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="${x2Pct}%" y2="${y2Pct}%">
      <stop offset="0%" style="stop-color:${c1}"/>
      <stop offset="100%" style="stop-color:${c2}"/>
    </linearGradient>
    ${patternDef}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)" />
  ${patternFill}
  ${accentSvg}
</svg>`;

        const destDir = path.join(app.getPath('userData'), 'branding');
        fs.mkdirSync(destDir, { recursive: true });
        const dest = path.join(destDir, 'background-ai.png');

        await sharp(Buffer.from(svg)).png({ quality: 90 }).toFile(dest);

        return { ok: true, backgroundPath: dest };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Background generation failed.' };
      }
    });

    // --- Branding image pickers ---
    ipcMain.handle('pick-branding-logo', async () => {
      if (!win) return null;
      const result = await dialog.showOpenDialog(win, {
        title: 'Select Brand Logo',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const src = result.filePaths[0];
      const destDir = path.join(app.getPath('userData'), 'branding');
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, `logo${path.extname(src)}`);
      fs.copyFileSync(src, dest);
      return dest;
    });

    ipcMain.handle('pick-branding-background', async () => {
      if (!win) return null;
      const result = await dialog.showOpenDialog(win, {
        title: 'Select Cover Page Background',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const src = result.filePaths[0];
      const destDir = path.join(app.getPath('userData'), 'branding');
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, `background${path.extname(src)}`);
      fs.copyFileSync(src, dest);
      return dest;
    });

    ipcMain.handle('read-branding-image-data-url', async (_event, imagePath: string) => {
      if (!imagePath || !fs.existsSync(imagePath)) return null;
      const ext = path.extname(imagePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const base64 = fs.readFileSync(imagePath, 'base64');
      return `data:${mime};base64,${base64}`;
    });
}

function createWindow() {
    win = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(path.join(RENDERER_DIST, 'index.html'));
    }
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
        win = null;
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.whenReady().then(() => {
    // Register protocol handler
    protocol.handle('local-asset', (request) => {
        const filePath = request.url.replace('local-asset://', '');
        const decoded = decodeURIComponent(filePath);
        const normalized = path.normalize(decoded);
        const ext = path.extname(normalized).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
          return new Response('Unsupported asset type', { status: 400 });
        }
        if (!path.isAbsolute(normalized) || !fs.existsSync(normalized)) {
          return new Response('Asset not found', { status: 404 });
        }
        return net.fetch(pathToFileURL(normalized).toString());
    });

    setupIpc();
    createWindow();
});
