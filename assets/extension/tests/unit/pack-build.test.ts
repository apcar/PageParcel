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
    expect(result.markdown).toContain('[Guide](<https://example.test/guide>)');
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

describe('Page Text cleanup', () => {
  it('separates CSS block spans inside cards and adjacent links without splitting inline words', () => {
    const { markdown } = buildPageText({
      ...draft.snapshot,
      html: `<html><body><main><a href="/item"><span data-pageparcel-block="true">Example by Author</span><span data-pageparcel-block="true">Useful description</span></a><a href="/next">Next</a><p>un<em>break</em>able</p><span data-pageparcel-block="true">Region Alpha</span><span data-pageparcel-block="true">42%</span></main></body></html>`,
    });
    expect(markdown).toContain('Example by Author · Useful description');
    expect(markdown).toMatch(/\) +\[Next/);
    expect(markdown).toContain('un*break*able');
    expect(markdown).toContain('Region Alpha\n\n42%');
  });
  it('removes global chrome but preserves local navigation, captions, and article footers', () => {
    const snapshot = {
      ...draft.snapshot,
      html: `<html><body><header><nav><a href="/">Global Home</a><a href="/shop">Global Shop</a></nav></header><main><h1>Useful report</h1><nav><a href="#one">Report section one</a><a href="#two">Report section two</a></nav><p>Substantive report with enough text to identify the content independently.</p><figure><figcaption>Important caption and source</figcaption></figure><footer>Author attribution</footer></main><div id="footerContainer"><a href="/legal">Global Legal</a><a href="/help">Global Help</a></div></body></html>`,
    };
    const cleaned = buildPageText(snapshot).markdown;
    expect(cleaned).not.toContain('Global Home');
    expect(cleaned).not.toContain('Global Legal');
    for (const text of [
      'Useful report',
      'Report section one',
      'Report section two',
      'Important caption and source',
      'Author attribution',
    ])
      expect(cleaned).toContain(text);
    expect(cleaned).toContain('site_navigation_blocks_removed: 2');
    const full = buildPageText(snapshot, true).markdown;
    expect(full).toContain('Global Home');
    expect(full).toContain('Global Legal');
    expect(full).toContain('site_navigation_blocks_removed: 0');
  });
  it('retains navigation-only directories and ambiguous prose-heavy headers', () => {
    const html = `<html><body><nav><a href="/a">Alpha</a><a href="/b">Beta</a></nav></body></html>`;
    expect(buildPageText({ ...draft.snapshot, html }).markdown).toContain('Alpha');
    const prose = 'Important introduction and source explanation. '.repeat(12);
    expect(
      buildPageText({
        ...draft.snapshot,
        html: `<html><body><header>${prose}<a href="/a">A</a><a href="/b">B</a></header><main><p>Report</p></main></body></html>`,
      }).markdown,
    ).toContain(prose.trim());
  });
});

describe('heading and presentation preservation', () => {
  const text = (html: string, keepCopies = false) =>
    buildPageText(
      { ...draft.snapshot, html: `<html><body>${html}</body></html>` },
      false,
      keepCopies,
    ).markdown;
  it('keeps semantic headings on one line despite block wrappers and keeps emphasis', () => {
    const result = text(
      '<h1>What makes you <div data-pageparcel-block="true">unique</div></h1><h2><div data-pageparcel-block="true">Journeys</div> show <em>recent</em> history</h2><h3><span data-pageparcel-block="true">Traits</span> passed down</h3>',
    );
    expect(result).toContain('# What makes you unique');
    expect(result).toContain('## Journeys show *recent* history');
    expect(result).toContain('### Traits passed down');
    expect(result).not.toMatch(/^#{1,6}\s*$/m);
  });
  const report =
    '<p>A detailed report about Region Alpha and Region Beta.</p><ul><li>Region Alpha 42%</li><li>Region Beta 17%</li></ul><p>Source: Archive 1900.</p><a href="/source">Original source</a>';
  it('removes only marked matching export copies and offers lossless recovery', () => {
    const html = `<section>${report}<div data-pageparcel-presentation-copy="true">${report}</div></section>`;
    expect(text(html).match(/Region Alpha 42%/g)).toHaveLength(1);
    expect(text(html)).toContain('presentation_copies_removed: 1');
    expect(text(html, true).match(/Region Alpha 42%/g)).toHaveLength(2);
    expect(text(html, true)).toContain('presentation_copies_removed: 0');
  });
  it.each([
    report.replace('42%', '43%'),
    report.replace('Archive 1900', 'Archive 1901'),
    report.replace('href="/source"', 'href="/different-source"'),
    report + '<img alt="Unique historical photograph">',
    report + '<h3>Different section context</h3>',
  ])(
    'retains presentation copies with a distinct fact, source, image label, or heading',
    (copy) => {
      expect(
        text(
          `<section>${report}<div data-pageparcel-presentation-copy="true">${copy}</div></section>`,
        ),
      ).toContain('presentation_copies_removed: 0');
    },
  );
  it('retains ordinary repeated prose and matching blocks in different sections', () => {
    expect(text(`<section>${report}${report}</section>`).match(/Region Alpha 42%/g)).toHaveLength(
      2,
    );
    expect(
      text(
        `<section>${report}</section><section><div data-pageparcel-presentation-copy="true">${report}</div></section>`,
      ),
    ).toContain('presentation_copies_removed: 0');
  });
});

it('retains marked root headings, source links, and structured tables even when nearby prose matches', () => {
  const phrase = 'Detailed report information that must retain its structure';
  for (const copy of [
    `<h2 data-pageparcel-presentation-copy="true">${phrase}</h2>`,
    `<a data-pageparcel-presentation-copy="true" href="/unique-source">${phrase}</a>`,
    `<table data-pageparcel-presentation-copy="true"><tr><td>${phrase}</td></tr></table>`,
  ]) {
    const markdown = buildPageText({
      ...draft.snapshot,
      html: `<html><body><section><p>${phrase}</p>${copy}</section></body></html>`,
    }).markdown;
    expect(markdown).toContain('presentation_copies_removed: 0');
  }
});

it('preserves GitHub-style pre blocks without code children as literal fenced code', () => {
  const html =
    '<html><body><pre><div><span># For latest version\n</span><span>npm install tesseract.js@next\n</span><span>const x = (a) => a_value;\n</span><span>```nested fence\n</span></div><button>Copy</button></pre></body></html>';
  const markdown = buildPageText({ ...draft.snapshot, html }).markdown;
  expect(markdown).toContain(
    '````\n# For latest version\nnpm install tesseract.js@next\nconst x = (a) => a_value;\n```nested fence\n````',
  );
  expect(markdown).not.toContain('\\=');
  expect(markdown).not.toContain('Copy');
});
it('preserves table links, inline code, and caption while expanding merged header/data cells', () => {
  const html =
    '<html><body><table><caption>Measurements</caption><thead><tr><th rowspan="2">Name</th><th colspan="2">Values</th></tr><tr><th>Low</th><th>High</th></tr></thead><tbody><tr><td rowspan="2"><a href="/reference">Source</a></td><td><code>a_value</code></td><td>9</td></tr><tr><td>2</td><td>10</td></tr></tbody></table></body></html>';
  const markdown = buildPageText({ ...draft.snapshot, html }).markdown;
  expect(markdown).toContain('Measurements');
  expect(markdown).toContain('| Name | Values / Low | Values / High |');
  expect(markdown).toContain('| [Source](<https://example.test/reference>) | `a_value` | 9 |');
  expect(markdown).toContain('| [Source](<https://example.test/reference>) | 2 | 10 |');
  expect(markdown).toContain('Merged table cells expanded');
});
it('does not promote a first data row to a header and preserves complex cell code as records', () => {
  const simple = buildPageText({
    ...draft.snapshot,
    html: '<html><body><table><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></table></body></html>',
  }).markdown;
  expect(simple).toContain('| Column 1 | Column 2 |');
  expect(simple).toContain('| A | 1 |');
  const complex = buildPageText({
    ...draft.snapshot,
    html: '<html><body><table><tr><td><pre>const a = 1;</pre></td><td>Explanation</td></tr></table></body></html>',
  }).markdown;
  expect(complex).toContain('row/cell records');
  expect(complex).toContain('const a = 1;');
  expect(complex).toContain('Explanation');
});

it('retains TH row headers as data, including single-column and mixed header tables', () => {
  const html =
    '<html><body><table><tr><th scope="row">January</th></tr><tr><th scope="row">February</th></tr></table><table><tr><th>Month</th><th>Value</th></tr><tr><th scope="row">March</th><th scope="row">42</th></tr></table></body></html>';
  const markdown = buildPageText({ ...draft.snapshot, html }).markdown;
  expect(markdown).toContain('| Column 1 |');
  expect(markdown).toContain('| January |');
  expect(markdown).toContain('| February |');
  expect(markdown).toContain('| Month | Value |');
  expect(markdown).toContain('| March | 42 |');
});
it('removes identified MediaWiki controls while retaining article navigation and attribution', () => {
  const html =
    '<html><body><main><div id="p-associated-pages" class="mw-portlet-associated-pages">Article Talk</div><div id="p-views" class="mw-portlet-views">Read View source View history</div><nav class="vector-appearance-landmark" aria-label="Appearance">Theme Text size</nav><nav aria-label="Contents"><a href="#history">History</a></nav><h1>Article</h1><p>Useful article content.</p></main><footer class="mw-footer"><ul id="footer-info"><li>Attribution and <a href="/license">License</a></li></ul><ul id="footer-places"><li>Site links</li></ul><ul id="footer-icons"><li>Site icons</li></ul></footer></body></html>';
  const snapshot = { ...draft.snapshot, html };
  const markdown = buildPageText(snapshot).markdown;
  for (const unwanted of [
    'Article Talk',
    'View history',
    'Theme Text size',
    'Site links',
    'Site icons',
  ])
    expect(markdown).not.toContain(unwanted);
  for (const retained of ['History', 'Useful article content', 'Attribution', 'License'])
    expect(markdown).toContain(retained);
  expect(buildPageText(snapshot, true).markdown).toContain('Article Talk');
});
