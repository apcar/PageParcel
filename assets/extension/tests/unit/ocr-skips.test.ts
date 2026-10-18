import { afterEach, expect, it, vi } from 'vitest';
import { collectOcrImages } from '../../src/content/ocr-regions';
import { ocrMarkdown } from '../../src/ocr/markdown';
afterEach(() => vi.unstubAllGlobals());
it('records exact reasons without confusing browser security with generic failures', async () => {
  class TestImage {
    tagName = 'IMG';
    naturalWidth = 200;
    naturalHeight = 100;
    constructor(public label: string) {
      if (label === 'unloaded') this.naturalWidth = 0;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 };
    }
    getAttribute(name: string) {
      return name === 'alt' ? this.label : null;
    }
    closest() {
      return null;
    }
    contains() {
      return false;
    }
  }
  let current: TestImage;
  const images = ['covered', 'unloaded', 'security', 'decode'].map((s) => new TestImage(s));
  vi.stubGlobal('HTMLImageElement', TestImage);
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('getComputedStyle', (image: TestImage) => {
    current = image;
    return { display: 'block', visibility: 'visible', opacity: '1' };
  });
  vi.stubGlobal('document', {
    querySelectorAll: () => images,
    elementFromPoint: () => (current.label === 'covered' ? {} : current),
    createElement: () => ({
      getContext: () => ({ fillRect: vi.fn(), drawImage: vi.fn() }),
      toDataURL: () => {
        const error = new Error('read failed');
        if (current.label === 'security') error.name = 'SecurityError';
        throw error;
      },
    }),
  });
  const capture = await collectOcrImages();
  expect(capture.omitted).toBe(4);
  expect(capture.skipped).toEqual([
    { label: 'covered', reason: 'covered' },
    { label: 'unloaded', reason: 'not-loaded' },
    { label: 'security', reason: 'browser-security' },
    { label: 'decode', reason: 'read-failed' },
  ]);
  const markdown = ocrMarkdown(capture);
  expect(markdown).toContain('Browser security blocked pixel access');
  expect(markdown).toContain('Covered by another page element');
  expect(markdown).toContain('no readable pixel dimensions');
  expect(markdown).toContain('did not provide a more specific reason');
});
