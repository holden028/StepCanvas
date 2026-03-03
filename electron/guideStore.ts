import fs from 'node:fs';
import path from 'node:path';
import { app, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import { createEmptyGuide } from '../shared/defaults';
import type { GuideData, Step } from '../shared/types';

const APP_DIR = path.join(app.getPath('documents'), 'StepCanvas');
const LAST_GUIDE_FILE = path.join(APP_DIR, 'last-guide.json');

function ensureDir(target: string): void {
  fs.mkdirSync(target, { recursive: true });
}

function safeWriteJson(targetPath: string, data: unknown): void {
  const tempPath = `${targetPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, targetPath);
}

function toRelativeImagePath(imagePath: string): string {
  return imagePath.startsWith('images/') ? imagePath : `images/${path.basename(imagePath)}`;
}

function copySingleImage(imagePath: string, guideDir: string): string {
  const imagesDir = path.join(guideDir, 'images');
  ensureDir(imagesDir);
  const sourcePath = path.isAbsolute(imagePath) ? imagePath : path.join(guideDir, imagePath);
  const destRelative = toRelativeImagePath(imagePath);
  const destPath = path.join(guideDir, destRelative);
  if (fs.existsSync(sourcePath) && sourcePath !== destPath) {
    fs.copyFileSync(sourcePath, destPath);
  }
  return destRelative;
}

function copyStepImage(step: Step, guideDir: string): Step {
  const result = { ...step };
  if (step.screenshotPath) {
    result.screenshotPath = copySingleImage(step.screenshotPath, guideDir);
  }
  if (step.screenshotFullPath) {
    result.screenshotFullPath = copySingleImage(step.screenshotFullPath, guideDir);
  }
  return result;
}

function hydrateImagePath(imagePath: string | undefined, guideDir: string): string | undefined {
  if (!imagePath) return undefined;
  return path.isAbsolute(imagePath) ? imagePath : path.join(guideDir, imagePath);
}

function hydrateStep(step: Step, guideDir: string): Step {
  return {
    ...step,
    screenshotPath: hydrateImagePath(step.screenshotPath, guideDir),
    screenshotFullPath: hydrateImagePath(step.screenshotFullPath, guideDir),
  };
}

export function loadLastGuide(): { guide: GuideData; guidePath: string | null; recentGuides: string[] } {
  ensureDir(APP_DIR);
  if (!fs.existsSync(LAST_GUIDE_FILE)) {
    return { guide: createEmptyGuide(), guidePath: null, recentGuides: [] };
  }
  const state = JSON.parse(fs.readFileSync(LAST_GUIDE_FILE, 'utf-8')) as {
    lastGuidePath: string | null;
    recentGuides: string[];
  };
  if (state.lastGuidePath && fs.existsSync(path.join(state.lastGuidePath, 'guide.json'))) {
    const guide = readGuide(state.lastGuidePath);
    return { guide, guidePath: state.lastGuidePath, recentGuides: state.recentGuides ?? [] };
  }
  return { guide: createEmptyGuide(), guidePath: null, recentGuides: state.recentGuides ?? [] };
}

export function saveLastGuidePath(guidePath: string | null, recentGuides: string[]): void {
  ensureDir(APP_DIR);
  safeWriteJson(LAST_GUIDE_FILE, { lastGuidePath: guidePath, recentGuides });
}

export function readGuide(guideDir: string): GuideData {
  const guidePath = path.join(guideDir, 'guide.json');
  const raw = JSON.parse(fs.readFileSync(guidePath, 'utf-8')) as GuideData;
  return {
    ...raw,
    steps: raw.steps.map((step) => hydrateStep(step, guideDir)),
  };
}

export function writeGuide(guideDir: string, guide: GuideData): void {
  ensureDir(guideDir);
  ensureDir(path.join(guideDir, 'images'));
  const normalized: GuideData = {
    ...guide,
    meta: { ...guide.meta, updatedAt: Date.now() },
    steps: guide.steps.map((step) => copyStepImage(step, guideDir)),
  };
  safeWriteJson(path.join(guideDir, 'guide.json'), normalized);
}

export async function chooseGuideForSave(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose StepCanvas guide folder',
    buttonLabel: 'Use Folder',
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    defaultPath: APP_DIR,
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
}

export async function chooseGuideToOpen(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Open StepCanvas guide',
    buttonLabel: 'Open Guide Folder',
    properties: ['openDirectory'],
    defaultPath: APP_DIR,
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
}
