import { describe, expect, it } from 'vitest';
import { createEmptyGuide } from '../../shared/defaults';
import { htmlForGuide, toMarkdown } from './service';

describe('export service', () => {
  it('renders markdown with step headings', () => {
    const guide = createEmptyGuide();
    guide.meta.title = 'My Guide';
    guide.steps.push({
      id: 'step-1',
      type: 'click',
      title: 'Open Settings',
      description: 'Click settings icon',
      timestamp: Date.now(),
      annotations: [],
    });
    const markdown = toMarkdown(guide);
    expect(markdown).toContain('# My Guide');
    expect(markdown).toContain('## Step 1 - Open Settings');
  });

  it('renders html structure', () => {
    const guide = createEmptyGuide();
    guide.meta.title = 'HTML Guide';
    const html = htmlForGuide(guide);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('HTML Guide');
  });
});
