import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOMParser as LinkedomParser } from 'linkedom';
import { collectPageSnapshot } from '../../src/content/page-snapshot';
import { buildPageText, buildReaderMarkdown, buildStructuredMarkdown } from '../../src/pack/build';

beforeAll(() => {
  globalThis.DOMParser = LinkedomParser as unknown as typeof DOMParser;
});
afterEach(() => vi.unstubAllGlobals());

function snapshotOf(body: string, textOnly = false, live: Record<string, string> = {}) {
  const doc = new LinkedomParser().parseFromString(
    `<html><head><title>Fixture</title></head><body>${body}</body></html>`,
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
  vi.stubGlobal('navigator', { language: 'en' });
  vi.stubGlobal('location', { href: 'https://example.test/form', hostname: 'example.test' });
  vi.stubGlobal('getComputedStyle', () => ({
    display: 'inline',
    visibility: 'visible',
    position: 'static',
    opacity: '1',
  }));
  for (const el of Array.from(doc.querySelectorAll('*')))
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ right: 100, bottom: 100 }),
    });
  // Live values the user typed; they exist only as properties, never as markup.
  for (const field of Array.from(doc.querySelectorAll<HTMLInputElement>('[data-key]'))) {
    const value = live[field.getAttribute('data-key') || ''] ?? '';
    Object.defineProperty(field, 'value', { value, writable: true, configurable: true });
    field.removeAttribute('data-key');
  }
  return collectPageSnapshot(textOnly);
}

describe('redaction of secret-like fields in the Trace Bundle', () => {
  const fields = `
    <input type="password" name="pw" data-key="pw">
    <input name="cardnumber" autocomplete="cc-number" data-key="card">
    <input name="cvc" data-key="cvc">
    <input aria-label="API key" data-key="api">
    <input placeholder="One-time code" data-key="otp">
    <input name="ssn" data-key="ssn">
    <textarea name="private_key" data-key="key"></textarea>
    <input type="hidden" name="csrf" value="HIDDEN-CSRF">
    <input aria-label="City" data-key="city">
    <textarea aria-label="Notes" data-key="notes"></textarea>
    <p>Payment details</p>`;
  const live = {
    pw: 'hunter2-PASSWORD',
    card: '4111111111111111',
    cvc: '123-CVC',
    api: 'sk-live-ARIA',
    otp: '999111-OTP',
    ssn: '078-05-1120',
    key: '-----BEGIN PRIVATE KEY-----',
    city: 'Austin',
    notes: 'Call back Tuesday',
  };

  it('redacts by type, name, autocomplete, aria-label and placeholder; keeps ordinary fields', () => {
    const snapshot = snapshotOf(fields, false, live);
    const markdown = buildStructuredMarkdown({ snapshot });
    for (const secret of [
      'hunter2-PASSWORD',
      '4111111111111111',
      '123-CVC',
      'sk-live-ARIA',
      '999111-OTP',
      '078-05-1120',
      'BEGIN PRIVATE KEY',
      'HIDDEN-CSRF',
    ]) {
      expect(snapshot.html).not.toContain(secret);
      expect(markdown).not.toContain(secret);
    }
    expect(snapshot.html.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(7);
    expect(markdown.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(6);
    expect(markdown).toContain('[City: Austin]');
    expect(snapshot.html).toContain('Call back Tuesday');
  });

  it('excludes every form field from Page Text', () => {
    const markdown = buildPageText(snapshotOf(fields, true, live)).markdown;
    expect(markdown).toContain('Payment details');
    expect(markdown).not.toContain('Austin');
    expect(markdown).not.toContain('Call back Tuesday');
    expect(markdown).not.toContain('REDACTED');
  });
});

describe('editable drafts are excluded from every text output', () => {
  const body = `<main><h1>Inbox</h1><p>Public message text that stays in the capture.</p>
    <div contenteditable="true">Draft one: unsent DRAFT-ALPHA</div>
    <div contenteditable="">Draft two: DRAFT-BETA</div>
    <div contenteditable="plaintext-only">Draft three: DRAFT-GAMMA</div>
    <div contenteditable="true"><p>Nested <b contenteditable="false">DRAFT-DELTA</b></p></div>
    <div contenteditable="false">Read-only widget text stays</div></main>`;

  it('drops editable regions from page.md, page-reader.md and page-text.md alike', () => {
    const snapshot = snapshotOf(body);
    const trace = {
      snapshot,
      segments: [],
      pageWidth: 1,
      pageHeight: 1,
      devicePixelRatio: 1,
      captureMethod: 'x',
    };
    const outputs = {
      structured: buildStructuredMarkdown(trace),
      reader: buildReaderMarkdown(trace),
      text: buildPageText(snapshotOf(body, true)).markdown,
    };
    for (const [label, markdown] of Object.entries(outputs)) {
      for (const draftText of ['DRAFT-ALPHA', 'DRAFT-BETA', 'DRAFT-GAMMA', 'DRAFT-DELTA'])
        expect(markdown, `${label} leaks ${draftText}`).not.toContain(draftText);
      expect(markdown, label).toContain('Public message text');
      expect(markdown, label).toContain('Read-only widget text stays');
    }
    expect(snapshot.html).not.toContain('DRAFT-');
    expect(outputs.structured.match(/Editable area excluded/g)?.length).toBe(4);
    expect(outputs.text).not.toContain('Editable area excluded');
  });
});

describe('executable content never reaches the output', () => {
  it('removes scripts, styles, frames, handlers, SVG markup and image sources', () => {
    const snapshot = snapshotOf(`
      <script>window.stolen = 1</script><style>body{}</style><noscript>NOSCRIPT</noscript>
      <iframe title="Payment frame" src="https://pay.example.test" srcdoc="<b>x</b>"></iframe>
      <a href="javascript:alert(1)" onclick="steal()">Click</a>
      <a href="data:text/html,<script>1</script>">Data link</a>
      <img src="https://tracker.example.test/pixel.gif" srcset="x 2x" alt="Logo" onerror="steal()">
      <svg onload="steal()"><script>1</script></svg>
      <object data="x.swf"></object><embed src="x.swf">
      <p onmouseover="steal()">Visible text</p>`);
    for (const forbidden of [
      '<script',
      'window.stolen',
      '<style',
      'NOSCRIPT',
      '<iframe',
      'srcdoc',
      'onclick',
      'onerror',
      'onload',
      'onmouseover',
      'tracker.example.test',
      '<svg',
      '<object',
      '<embed',
    ])
      expect(snapshot.html).not.toContain(forbidden);
    expect(snapshot.html).toContain('[Payment frame]');
    const markdown = buildStructuredMarkdown({ snapshot });
    expect(markdown).not.toMatch(/javascript:|data:text/);
    expect(markdown).toContain('Visible text');
    expect(markdown).toContain('[Image: Logo]');
  });
});

describe('manifest security invariants', () => {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../manifest.json'), 'utf8'));

  it('requests only the reviewed permissions and no host access', () => {
    expect([...manifest.permissions].sort()).toEqual(
      ['activeTab', 'downloads', 'scripting', 'storage', 'unlimitedStorage'].sort(),
    );
    expect(manifest.host_permissions).toEqual([]);
    for (const key of [
      'optional_permissions',
      'optional_host_permissions',
      'externally_connectable',
      'content_scripts',
      'web_accessible_resources',
      'update_url',
    ])
      expect(manifest[key]).toBeUndefined();
  });

  it('keeps a self-only CSP with no general eval or inline script', () => {
    const csp: string = manifest.content_security_policy.extension_pages;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    const scriptSrc = /script-src([^;]*)/.exec(csp)![1];
    expect(scriptSrc).not.toMatch(/'unsafe-eval'|'unsafe-inline'|https?:|\*/);
    expect(csp).not.toMatch(/https?:\/\//);
  });
});
