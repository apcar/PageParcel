import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { DOMParser as LinkedomParser } from 'linkedom';
import { strFromU8, unzipSync } from 'fflate';
import { buildCapturePack } from '../../src/pack/build';
import type { CapturePackDraft } from '../../src/shared/types';

// 1x1 transparent PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

beforeAll(() => {
  globalThis.DOMParser = LinkedomParser as unknown as typeof DOMParser;
});
afterEach(() => vi.unstubAllGlobals());

function draft(overrides: Partial<CapturePackDraft> = {}): CapturePackDraft {
  return {
    snapshot: {
      title: 'Console',
      url: 'https://console.example.test/inventory',
      language: 'en',
      description: '',
      capturedAt: '2026-10-19T01:46:40.561Z',
      truncated: false,
      html: '<html><body><h1>Inventory</h1><p>Two numbers are ready.</p></body></html>',
    },
    segments: [{ dataUrl: PNG, width: 1, height: 1, startY: 0 }],
    pageWidth: 1,
    pageHeight: 1,
    devicePixelRatio: 2,
    captureMethod: 'full-page-scroll-stitch',
    ...overrides,
  };
}

async function build(d: CapturePackDraft) {
  vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '9.9.9' }) } });
  const pack = await buildCapturePack(d);
  const files = unzipSync(pack.bytes);
  const manifest = JSON.parse(strFromU8(files['page.json']));
  return { pack, files, manifest };
}

describe('Trace Bundle', () => {
  it('registers every artifact with its byte count and SHA-256, and reports the extension version', async () => {
    const { files, manifest } = await build(draft());
    expect(manifest.generator).toEqual({ name: 'PageParcel', version: '9.9.9' });
    const names = Object.keys(files).filter((name) => name !== 'page.json');
    expect(manifest.artifacts.map((a: { name: string }) => a.name).sort()).toEqual(names.sort());
    for (const artifact of manifest.artifacts) {
      const data = files[artifact.name];
      expect(artifact.bytes).toBe(data.length);
      expect(artifact.sha256).toBe(createHash('sha256').update(data).digest('hex'));
    }
    expect(Object.keys(files).some((name) => /\.html?$/i.test(name))).toBe(false);
  });

  it('keeps the uncropped first viewport when an inner element scrolled', async () => {
    const plain = await build(draft());
    expect(plain.files['page-viewport.png']).toBeUndefined();
    expect(plain.manifest.capture.scroll_container).toBe(false);
    const app = await build(
      draft({ viewportContext: { dataUrl: PNG, width: 2400, height: 1600 } }),
    );
    expect(app.files['page-viewport.png']).toBeDefined();
    expect(app.manifest.capture.scroll_container).toBe(true);
    expect(app.manifest.capture.viewport_context).toEqual({
      artifact: 'page-viewport.png',
      width_px: 2400,
      height_px: 1600,
    });
    expect(app.manifest.artifacts.map((a: { name: string }) => a.name)).toContain(
      'page-viewport.png',
    );
  });
});
