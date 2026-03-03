import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const KEY_FILE = 'ai-key.enc';

function keyPath(): string {
  return path.join(app.getPath('userData'), KEY_FILE);
}

export function saveApiKey(key: string): void {
  const encoded = Buffer.from(key, 'utf-8').toString('base64');
  fs.writeFileSync(keyPath(), encoded, 'utf-8');
}

export function loadApiKey(): string {
  try {
    const encoded = fs.readFileSync(keyPath(), 'utf-8').trim();
    return Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

export function clearApiKey(): void {
  try {
    fs.unlinkSync(keyPath());
  } catch {
    // File may not exist.
  }
}

export function hasApiKey(): boolean {
  return loadApiKey().length > 0;
}
