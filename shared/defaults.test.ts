import { describe, expect, it } from 'vitest';
import { createEmptyGuide } from './defaults';

describe('createEmptyGuide', () => {
  it('creates a valid empty guide', () => {
    const guide = createEmptyGuide();
    expect(guide.version).toBe(1);
    expect(guide.steps).toHaveLength(0);
    expect(guide.nextStepNumber).toBe(1);
    expect(guide.settings.screenshotMode).toBe('snippet');
    expect(guide.settings.maskKeystrokes).toBe(false);
  });
});
