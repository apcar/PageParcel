import { afterEach, describe, expect, it, vi } from 'vitest';
import { recognizeImages } from '../../src/ocr/recognize';
import { ocrMarkdown } from '../../src/ocr/markdown';
import type { OcrCapture } from '../../src/ocr/types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const capture = (): OcrCapture => ({
  images: [{ label: 'Fixture', dataUrl: 'data:image/png;base64,YQ==' }],
  omitted: 0,
});
function setup(stall = false) {
  const calls: Array<{ action: string; payload: unknown }> = [];
  const terminate = vi.fn();
  class MockWorker {
    onmessage?: (event: unknown) => void;
    terminate = terminate;
    postMessage(message: { jobId: string; action: string; payload: unknown }) {
      calls.push(message);
      if (!stall)
        queueMicrotask(() =>
          this.onmessage?.({
            data: {
              jobId: message.jobId,
              status: 'resolve',
              data: message.action === 'recognize' ? { text: 'Invoice 42', confidence: 91 } : {},
            },
          }),
        );
    }
  }
  vi.stubGlobal('Worker', MockWorker);
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  });
  return { calls, terminate };
}
describe('bounded local OCR', () => {
  it('uses only local assets, returns text, terminates, and discards pixels', async () => {
    const { calls, terminate } = setup();
    const value = capture();
    await recognizeImages(value, vi.fn());
    expect(value.results?.[0].text).toBe('Invoice 42');
    expect(value.images).toEqual([]);
    expect(terminate).toHaveBeenCalled();
    expect(JSON.stringify(calls)).not.toContain('https:');
    expect(calls.map((c) => c.action)).toEqual([
      'load',
      'loadLanguage',
      'initialize',
      'setParameters',
      'recognize',
    ]);
    expect(JSON.stringify(calls[1])).toContain('"cacheMethod":"none"');
  });
  it('terminates even a stalled initialization at its deadline', async () => {
    vi.useFakeTimers();
    const { terminate } = setup(true);
    const value = capture();
    const job = recognizeImages(value, vi.fn());
    await vi.advanceTimersByTimeAsync(45_000);
    await job;
    expect(terminate).toHaveBeenCalled();
    expect(value.error).toContain('could not finish');
    expect(value.images).toEqual([]);
  });
  it('clearly labels OCR and escapes embedded HTML while preserving failures', () => {
    const text = ocrMarkdown({
      images: [],
      omitted: 2,
      error: 'Partial capture',
      results: [
        {
          label: '<script>',
          text: 'Read me\n<img src=x>\n```\n![tracking](https://example.test/pixel)',
          confidence: 30,
        },
      ],
    });
    expect(text).toContain('Local English OCR');
    expect(text).toContain('2 candidate');
    expect(text).toContain('Partial capture');
    expect(text).toContain('````text\n<script>');
    expect(text).toContain('<img src=x>');
    expect(text.trim().endsWith('````')).toBe(true);
  });
});
