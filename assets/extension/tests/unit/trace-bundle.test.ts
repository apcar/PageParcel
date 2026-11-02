import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { DOMParser as LinkedomParser } from 'linkedom';
import { strFromU8, unzipSync } from 'fflate';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildCapturePack, buildPageText, sealPageText } from '../../src/pack/build';
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

const VERIFIER = resolve(__dirname, '../../../../scripts/verify_bundle.py');
function verifyWithPython(name: string, data: Uint8Array | string) {
  const dir = mkdtempSync(join(tmpdir(), 'pageparcel-'));
  const path = join(dir, name);
  writeFileSync(path, data);
  try {
    return JSON.parse(execFileSync('python3', [VERIFIER, '--json', path], { encoding: 'utf8' }));
  } catch (error) {
    return JSON.parse((error as { stdout: string }).stdout);
  }
}

describe('schema 1.1 additions', () => {
  it('includes faithful Page Text from the same capture and registers it', async () => {
    const textSnapshot = {
      ...draft().snapshot,
      html: '<html><body><h1>Inventory</h1><p>Two numbers are ready.</p><input value="secret-ish"></body></html>',
    };
    const { files, manifest } = await build(draft({ textSnapshot }));
    expect(manifest.schema_version).toBe('1.1');
    expect(manifest.extraction.page_text_included).toBe(true);
    const text = strFromU8(files['page-text.md']);
    expect(text).toContain('capture_variant: page-text');
    expect(text).toContain('Two numbers are ready.');
    expect(text).not.toContain('secret-ish');
    expect(manifest.artifacts.map((a: { name: string }) => a.name)).toContain('page-text.md');
  });

  it('flags a sparse reader view instead of implying it is complete', async () => {
    // Modeled on a help-center request form: Defuddle keeps the heading, drops the form.
    const appPage = `<html><body><main><h1>Report a problem</h1><form>${'<label><input type="checkbox"> Personal information category with a long description</label><p>Explain the content you are reporting and why it should be removed.</p>'.repeat(20)}</form></main></body></html>`;
    const { files, manifest } = await build(
      draft({ snapshot: { ...draft().snapshot, html: appPage } }),
    );
    expect(manifest.extraction.reader_sparse).toBe(true);
    const reader = strFromU8(files['page-reader.md']);
    expect(reader).toContain('Reader view kept about');
    expect(reader).not.toMatch(/complete capture/i);
    expect(reader).toContain('no text output includes frames, hidden or editable content');
    const article = await build(draft());
    expect(article.manifest.extraction.reader_sparse).toBe(false);
    expect(strFromU8(article.files['page-reader.md'])).not.toContain('Reader view kept about');
  });

  it('produces bundles the Python verifier accepts, and rejects when tampered', async () => {
    const { pack } = await build(draft({ textSnapshot: draft().snapshot }));
    expect(verifyWithPython('bundle.zip', pack.bytes).ok).toBe(true);
    const files = unzipSync(pack.bytes);
    files['page.md'] = new TextEncoder().encode('# edited\n');
    const { zipSync } = await import('fflate');
    const tampered = verifyWithPython('tampered.zip', zipSync(files));
    expect(tampered.ok).toBe(false);
    expect(tampered.errors.join(' ')).toContain('hash mismatch: page.md');
  });
});

describe('sealed Page Text', () => {
  it('adds schema, generator and a whole-file SHA-256 the verifier can check', async () => {
    const { markdown } = buildPageText({
      ...draft().snapshot,
      html: '<html><body><h1>Title</h1><p>Body text.</p></body></html>',
    });
    const sealed = await sealPageText(`${markdown}\n## Appendix\n\nAppended text\n`, '9.9.9');
    expect(sealed).toMatch(/\npageparcel_schema: page-text\/1\.0\n/);
    expect(sealed).toContain('generator: "PageParcel 9.9.9"');
    expect(sealed).toMatch(/\npageparcel_sha256: [0-9a-f]{64}\n---\n/);
    const unsealed = sealed.replace(/^pageparcel_sha256: [0-9a-f]{64}\n/m, '');
    const digest = sealed.match(/pageparcel_sha256: ([0-9a-f]{64})/)![1];
    expect(createHash('sha256').update(unsealed, 'utf8').digest('hex')).toBe(digest);

    expect(verifyWithPython('page.md', sealed).ok).toBe(true);
    expect(verifyWithPython('edited.md', sealed.replace('Body text.', 'Body text!')).ok).toBe(
      false,
    );
    expect(
      verifyWithPython('edited-source.md', sealed.replace('console.example.test', 'evil.test')).ok,
    ).toBe(false);
    expect(verifyWithPython('unsealed.md', markdown).ok).toBe(false);
  });
});
