import { afterEach, expect, it, vi } from 'vitest';
import { DOMParser as LinkedomParser } from 'linkedom';
import { collectPageSnapshot } from '../../src/content/page-snapshot';
import { buildPageText } from '../../src/pack/build';
afterEach(() => vi.unstubAllGlobals());
it('marks off-canvas export copies and preserves accessible content and complete headings end-to-end', () => {
  const doc = new LinkedomParser().parseFromString(
    `<html><head><title>Fixture</title></head><body><h1>What makes you <div>unique<canvas></canvas></div></h1><section><p>Region Alpha has a share of 42 percent.</p><div class="sharePreview"><p>Region Alpha has a share of 42 percent.</p></div><span class="screenReaderOnly">Important accessible note</span></section></body></html>`,
    'text/html',
  );
  const view = doc.defaultView as unknown as Record<string, unknown>;
  for (const name of [
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
    'HTMLDetailsElement',
  ])
    vi.stubGlobal(name, view[name] || class {});
  vi.stubGlobal('document', doc);
  vi.stubGlobal('DOMParser', LinkedomParser);
  vi.stubGlobal('navigator', { language: 'en' });
  vi.stubGlobal('location', { href: 'https://example.test/report', hostname: 'example.test' });
  vi.stubGlobal('getComputedStyle', (el: Element) => ({
    display: el.tagName === 'DIV' ? 'block' : 'inline',
    visibility: 'visible',
    position: el.className === 'sharePreview' ? 'absolute' : 'static',
  }));
  for (const el of Array.from(doc.querySelectorAll('*')))
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ right: el.className === 'sharePreview' ? -100 : 100, bottom: 100 }),
    });
  const snapshot = collectPageSnapshot(true);
  expect(snapshot.html).toContain('data-pageparcel-presentation-copy="true"');
  const markdown = buildPageText(snapshot).markdown;
  expect(markdown).toContain('# What makes you unique');
  expect(markdown).not.toContain('canvas pixels omitted');
  expect(markdown.match(/Region Alpha has a share of 42 percent/g)).toHaveLength(1);
  expect(markdown).toContain('Important accessible note');
  expect(
    buildPageText(snapshot, false, true).markdown.match(/Region Alpha has a share of 42 percent/g),
  ).toHaveLength(2);
});
