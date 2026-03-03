import type { NamingMode } from '../../shared/types';

export type AppCategory = 'browser' | 'email' | 'chat' | 'file-manager' | 'ide' | 'terminal' | 'other';

const CATEGORY_MAP: Record<string, AppCategory> = {
  'google chrome': 'browser',
  chrome: 'browser',
  safari: 'browser',
  firefox: 'browser',
  'microsoft edge': 'browser',
  edge: 'browser',
  arc: 'browser',
  brave: 'browser',
  'brave browser': 'browser',
  opera: 'browser',
  vivaldi: 'browser',

  mail: 'email',
  outlook: 'email',
  'microsoft outlook': 'email',
  thunderbird: 'email',
  spark: 'email',
  airmail: 'email',

  slack: 'chat',
  discord: 'chat',
  teams: 'chat',
  'microsoft teams': 'chat',
  telegram: 'chat',
  whatsapp: 'chat',
  messages: 'chat',
  signal: 'chat',
  zoom: 'chat',

  finder: 'file-manager',
  'file explorer': 'file-manager',
  'windows explorer': 'file-manager',
  'files': 'file-manager',

  'visual studio code': 'ide',
  'code': 'ide',
  cursor: 'ide',
  xcode: 'ide',
  'intellij idea': 'ide',
  webstorm: 'ide',
  pycharm: 'ide',
  'android studio': 'ide',
  'sublime text': 'ide',

  terminal: 'terminal',
  iterm2: 'terminal',
  iterm: 'terminal',
  warp: 'terminal',
  hyper: 'terminal',
  alacritty: 'terminal',
  kitty: 'terminal',
};

const GENERIC_LABELS: Record<AppCategory, string> = {
  browser: 'Web Browser',
  email: 'Email Client',
  chat: 'Messaging App',
  'file-manager': 'File Manager',
  ide: 'Code Editor',
  terminal: 'Terminal',
  other: 'Application',
};

const GENERIC_ACTIONS: Record<AppCategory, string> = {
  browser: 'Open Web Browser',
  email: 'Check Email',
  chat: 'Open Messaging App',
  'file-manager': 'Open File Manager',
  ide: 'Open Code Editor',
  terminal: 'Open Terminal',
  other: 'Open Application',
};

export function classifyApp(appName: string): AppCategory {
  const key = appName.toLowerCase().trim();
  return CATEGORY_MAP[key] ?? 'other';
}

export function genericLabel(category: AppCategory): string {
  return GENERIC_LABELS[category];
}

export function genericAction(category: AppCategory): string {
  return GENERIC_ACTIONS[category];
}

export function resolveAppLabel(appName: string, mode: NamingMode): string {
  if (mode === 'specific') return appName;

  const category = classifyApp(appName);
  if (mode === 'generic') return genericLabel(category);

  // hybrid: use generic for common categories, specific for "other"
  if (category === 'other') return appName;
  return genericLabel(category);
}

export function resolveActionLabel(appName: string, mode: NamingMode): string {
  if (mode === 'specific') return `Open ${appName}`;

  const category = classifyApp(appName);
  if (mode === 'generic') return genericAction(category);

  if (category === 'other') return `Open ${appName}`;
  return genericAction(category);
}
