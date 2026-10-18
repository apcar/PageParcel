import { beforeAll, describe, expect, it } from 'vitest';
import { DOMParser as LinkedomParser } from 'linkedom';
import type { CapturePackDraft } from '../../src/shared/types';
import { buildStructuredMarkdown, buildPageText } from '../../src/pack/build';

beforeAll(() => {
  globalThis.DOMParser = LinkedomParser as unknown as typeof DOMParser;
});

const draft: CapturePackDraft = {
  snapshot: {
    title: 'Account Overview',
    url: 'https://example.test/account',
    language: 'en',
    description: 'Fixture',
    capturedAt: '2026-07-20T12:00:00.000Z',
    truncated: false,
    html: `<!doctype html><html><body>
      <h2>Orders</h2>
      <table><tr><th>ID</th><th>Status</th></tr><tr><td>42</td><td>Ready</td></tr></table>
      <a href="javascript:alert(1)">Unsafe link</a>
      <input aria-label="Customer" value="Andrew">
      <img alt="Chart">
    </body></html>`,
  },
  segments: [],
  pageWidth: 100,
  pageHeight: 200,
  devicePixelRatio: 2,
  captureMethod: 'full-page-scroll-stitch',
};

describe('structured Markdown', () => {
  it('preserves useful structure and removes executable URLs', () => {
    const markdown = buildStructuredMarkdown(draft);
    expect(markdown).toContain('# Account Overview');
    expect(markdown).toContain('| ID | Status |');
    expect(markdown).toContain('| 42 | Ready |');
    expect(markdown).toContain('[Customer: Andrew]');
    expect(markdown).toContain('[Image: Chart]');
    expect(markdown).not.toContain('javascript:');
  });
});

describe('Page Text', () => {
  it('exports one sourced Markdown file, preserving structure and resolving links', () => {
    const result = buildPageText({
      ...draft.snapshot,
      html: `<html><body><h2>Heading</h2><ul><li>Item</li></ul><a href="../guide">Guide</a><pre><code>const x = 1;</code></pre><img alt="Diagram"></body></html>`,
    });
    expect(result.filename).toBe('PageParcel-20260720T120000Z-Account Overview.md');
    expect(result.markdown).toContain('source: "https://example.test/account"');
    expect(result.markdown).toContain('captured_at: "2026-07-20T12:00:00.000Z"');
    expect(result.markdown).toContain('## Heading');
    expect(result.markdown).toMatch(/-\s+Item/);
    expect(result.markdown).toContain('[Guide](https://example.test/guide)');
    expect(result.markdown).toContain('const x = 1;');
    expect(result.markdown).toContain('[Image: Diagram]');
    expect(result.markdown).toContain('truncated: false');
  });
  it('excludes form and editable values and marks incomplete captures', () => {
    const result = buildPageText({
      ...draft.snapshot,
      truncated: true,
      html: `<html><body><p>Public text</p><input value="secret-one"><textarea>secret-two</textarea><select><option>secret-three</option></select><div contenteditable="true">secret-four</div><script>secret-five</script><a href="javascript:alert(1)">Link</a></body></html>`,
    });
    expect(result.markdown).not.toContain('secret-');
    expect(result.markdown).not.toContain('javascript:');
    expect(result.markdown).toContain('truncated: true');
    expect(result.markdown).toContain('Capture limit reached');
  });
  it('reports empty content instead of saving a misleading metadata-only file', () => {
    expect(() =>
      buildPageText({
        ...draft.snapshot,
        html: '<html><body><input value="private"></body></html>',
      }),
    ).toThrow('No page text');
  });
});
