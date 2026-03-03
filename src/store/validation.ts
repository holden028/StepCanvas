import type { GuideData } from '../../shared/types';

export function validateGuide(guide: GuideData): { ok: boolean; message?: string } {
  if (guide.steps.length === 0) {
    return { ok: false, message: 'Capture or add at least one step before export.' };
  }
  const emptyTitle = guide.steps.find((step) => step.title.trim().length === 0);
  if (emptyTitle) {
    return { ok: false, message: 'Each step must have a non-empty title.' };
  }
  return { ok: true };
}
