import { describe, expect, it } from 'vitest';
import { createEmptyGuide } from '../../shared/defaults';
import { validateGuide } from './validation';

describe('validateGuide', () => {
  it('rejects empty guides', () => {
    const result = validateGuide(createEmptyGuide());
    expect(result.ok).toBe(false);
  });

  it('accepts guides with titled steps', () => {
    const guide = createEmptyGuide();
    guide.steps.push({
      id: 'step-0001',
      type: 'text',
      title: 'Step 1',
      description: '',
      timestamp: Date.now(),
      annotations: [],
    });
    const result = validateGuide(guide);
    expect(result.ok).toBe(true);
  });
});
