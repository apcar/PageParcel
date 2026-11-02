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

it('captures visible open-component code while excluding hidden copies, inputs, and general shadow text', () => {
  const doc = new LinkedomParser().parseFromString(
    '<html><head><title>Components</title></head><body><mdn-code-example></mdn-code-example><mdn-code-example hidden></mdn-code-example><mdn-code-example data-opacity="0"></mdn-code-example></body></html>',
    'text/html',
  );
  const hosts = Array.from(doc.querySelectorAll('mdn-code-example'));
  hosts[0].attachShadow({ mode: 'open' }).innerHTML =
    '<p>GENERAL SHADOW TEXT</p><pre><code>const useful_value = 42;\n</code><input value="PRIVATE"><textarea>PRIVATE</textarea><span hidden>HIDDEN SECRET</span><button>Copy</button></pre><div hidden><pre>HIDDEN EXAMPLE</pre></div><details><summary>Closed sample</summary><pre>CLOSED DETAILS SECRET</pre></details>';
  hosts[1].attachShadow({ mode: 'open' }).innerHTML = '<pre>HIDDEN HOST EXAMPLE</pre>';
  hosts[2].attachShadow({ mode: 'open' }).innerHTML = '<pre>INVISIBLE HOST SECRET</pre>';
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
  vi.stubGlobal('location', { href: 'https://example.test/code', hostname: 'example.test' });
  vi.stubGlobal('getComputedStyle', (el: HTMLElement) => ({
    display: el.hidden ? 'none' : 'block',
    opacity: el.getAttribute('data-opacity') || '1',
    visibility: 'visible',
    position: 'static',
  }));
  for (const el of Array.from(doc.querySelectorAll('*')))
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ right: 100, bottom: 100 }),
    });
  const snapshot = collectPageSnapshot(true);
  const markdown = buildPageText(snapshot).markdown;
  expect(snapshot.shadowCodeBlocks).toBe(1);
  expect(markdown).toContain('```\nconst useful_value = 42;\n```');
  for (const forbidden of [
    'GENERAL SHADOW TEXT',
    'PRIVATE',
    'HIDDEN SECRET',
    'HIDDEN EXAMPLE',
    'HIDDEN HOST EXAMPLE',
    'CLOSED DETAILS SECRET',
    'INVISIBLE HOST SECRET',
    'Copy',
  ])
    expect(markdown).not.toContain(forbidden);
});
