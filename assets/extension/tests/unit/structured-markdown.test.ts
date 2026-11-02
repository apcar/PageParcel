import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DOMParser as LinkedomParser } from 'linkedom';
import { collectPageSnapshot } from '../../src/content/page-snapshot';
import {
  buildReaderMarkdown,
  buildStructuredMarkdown,
  controlLabel,
  tidyControls,
} from '../../src/pack/build';
import type { CapturePackDraft, PageSnapshot } from '../../src/shared/types';

beforeAll(() => {
  globalThis.DOMParser = LinkedomParser as unknown as typeof DOMParser;
});
afterEach(() => vi.unstubAllGlobals());

function snapshot(html: string): PageSnapshot {
  return {
    title: 'Numbers',
    url: 'https://console.example.test/account/AC123/inventory?tab=1',
    language: 'en',
    description: '',
    capturedAt: '2026-10-19T01:46:40.561Z',
    truncated: false,
    html,
  };
}

function draft(html: string): CapturePackDraft {
  return {
    snapshot: snapshot(html),
    segments: [],
    pageWidth: 1,
    pageHeight: 1,
    devicePixelRatio: 1,
    captureMethod: 'full-page-scroll-stitch',
  };
}

// Patterns observed in real app-console captures, rebuilt with synthetic values.
const consoleFixture = `<html><body>
  <ul>
    <li><a href="/account/AC123"></a></li>
    <li><a href="/account/AC123/products" aria-label="All products"></a></li>
    <li><a href="//cdn.example.test/help" title="Help center"></a></li>
  </ul>
  <ol><li><a href="#">Communications</a></li><li>Inventory</li></ol>
  <p><a href="../setup?guide=true">Set up a new phone number</a></p>
  <div><button>Phone Numbers</button><button>WhatsApp</button><button>RCS</button></div>
  <p>Search<input aria-label="Search" value=""></p>
  <div><button><img alt="">Trade Assurance</button><button><img alt="Search icon">Search</button></div>
  <pre><code>[Button: A][Button: B]</code></pre>
</body></html>`;

describe('structured Markdown quality', () => {
  it('resolves relative and protocol-relative links against the captured URL', () => {
    const markdown = buildStructuredMarkdown(draft(consoleFixture));
    expect(markdown).toContain(
      '[Set up a new phone number](https://console.example.test/account/setup?guide=true)',
    );
    expect(markdown).toContain('(https://cdn.example.test/help)');
    expect(markdown).not.toMatch(/\]\(\/account/);
  });

  it('labels links that have no visible text instead of emitting empty brackets', () => {
    const markdown = buildStructuredMarkdown(draft(consoleFixture));
    expect(markdown).not.toContain('[](');
    expect(markdown).toContain('[Link: unlabeled](https://console.example.test/account/AC123)');
    expect(markdown).toContain(
      '[Link: All products](https://console.example.test/account/AC123/products)',
    );
    expect(markdown).toContain('[Link: Help center](https://cdn.example.test/help)');
  });

  it('keeps bare "#" link text but drops the meaningless target', () => {
    const markdown = buildStructuredMarkdown(draft(consoleFixture));
    expect(markdown).toContain('Communications');
    expect(markdown).not.toContain('[Communications]');
  });

  it('collapses runs of buttons into one readable record without losing any label', () => {
    const markdown = buildStructuredMarkdown(draft(consoleFixture));
    expect(markdown).toContain('[Buttons: Phone Numbers · WhatsApp · RCS]');
    expect(markdown).toContain('[Buttons: Trade Assurance · Search icon Search]');
    expect(markdown.split('```')[0]).not.toContain('][Button:');
  });

  it('never rewrites code blocks', () => {
    const markdown = buildStructuredMarkdown(draft(consoleFixture));
    expect(markdown).toContain('[Button: A][Button: B]');
  });

  it('strips markup that some sites put inside aria-label values', () => {
    const markdown = buildStructuredMarkdown(
      draft(
        '<html><body><input type="checkbox" aria-label="<label>Bank account</label>"></body></html>',
      ),
    );
    expect(markdown).toContain('[ ] Bank account');
    expect(markdown).not.toContain('<label>');
  });

  it('reads selected options from snapshot attributes', () => {
    const markdown = buildStructuredMarkdown(
      draft(
        '<html><body><select aria-label="Country"><option>Canada</option><option selected>Mexico</option></select></body></html>',
      ),
    );
    expect(markdown).toContain('[Country: Mexico]');
  });

  it('omits text-less links from the reader view', () => {
    const markdown = buildReaderMarkdown(
      draft(
        '<html><body><article><h1>Story</h1><p>Body text for the reader.</p><a href="/x"></a></article></body></html>',
      ),
    );
    expect(markdown).not.toContain('[](');
    expect(markdown).not.toContain('[Link:');
  });
});

describe('control helpers', () => {
  it('builds plain labels from icon and image tokens', () => {
    expect(controlLabel('[Image: unlabeled]Trade Assurance')).toBe('Trade Assurance');
    expect(controlLabel('[Image: Avatar of Sam]')).toBe('Avatar of Sam');
    expect(controlLabel(' Active\n\nAvailable balance: $20.00 ')).toBe(
      'Active Available balance: $20.00',
    );
  });

  it('separates adjacent tokens and groups whole-line button runs, including list items', () => {
    expect(tidyControls('-   [Button: A][Button: B]')).toBe('-   [Buttons: A · B]');
    expect(tidyControls('Text [Image: x][Button: Go]')).toBe('Text [Image: x] [Button: Go]');
    expect(tidyControls('| [Button: A][Button: B] |')).toBe('| [Button: A] [Button: B] |');
  });
});

describe('snapshot support for structured Markdown', () => {
  function stubDom(html: string, displays: Record<string, string> = {}) {
    const doc = new LinkedomParser().parseFromString(html, 'text/html');
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
    vi.stubGlobal('location', {
      href: 'https://console.example.test/account',
      hostname: 'console.example.test',
    });
    vi.stubGlobal('getComputedStyle', (el: Element) => ({
      display: displays[el.className] || (el.tagName === 'DIV' ? 'block' : 'inline'),
      visibility: 'visible',
      position: 'static',
      opacity: '1',
    }));
    for (const el of Array.from(doc.querySelectorAll('*')))
      Object.defineProperty(el, 'getBoundingClientRect', {
        value: () => ({ right: 100, bottom: 100 }),
      });
  }

  it('keeps block boundaries inside controls and accessible names of labeled icons', () => {
    stubDom(
      `<html><head><title>Console</title></head><body>
        <button class="balance"><div>Active</div><div>Available balance: $20.00</div><div>Learn more</div></button>
        <a href="/home"><svg aria-label="Home"><path d="M0"></path></svg></a>
        <a href="/bell"><svg><title>Notifications</title></svg></a>
        <a href="/hidden"><svg aria-hidden="true"><title>Decorative</title></svg></a>
        <span data-pageparcel-icon="true" aria-label="Forged by page">x</span>
      </body></html>`,
      { balance: 'flex' },
    );
    const snap = collectPageSnapshot();
    expect(snap.html).not.toContain('<svg');
    expect(snap.html).not.toContain('<path');
    const markdown = buildStructuredMarkdown({ snapshot: snap });
    expect(markdown).toContain('[Button: Active Available balance: $20.00 Learn more]');
    expect(markdown).toContain('[Link: Home](https://console.example.test/home)');
    expect(markdown).toContain('[Link: Notifications](https://console.example.test/bell)');
    expect(markdown).toContain('[Link: unlabeled](https://console.example.test/hidden)');
    expect(markdown).not.toContain('Decorative');
    expect(markdown).not.toContain('[Icon: Forged by page]');
  });
});

describe('code is never rewritten (Codex review)', () => {
  const literal = '[Button: Alpha][Button: Beta]';

  it('keeps a four-backtick block that contains a triple-backtick line literal', () => {
    const md = ['````', '```', literal, '```', literal, '````', literal].join('\n');
    expect(tidyControls(md).split('\n')).toEqual([
      '````',
      '```',
      literal,
      '```',
      literal,
      '````',
      '[Buttons: Alpha · Beta]',
    ]);
  });

  it('does not close a tilde fence with backticks, or a long fence with a shorter one', () => {
    expect(tidyControls(['~~~', '```', literal, '~~~', literal].join('\n')).split('\n')).toEqual([
      '~~~',
      '```',
      literal,
      '~~~',
      '[Buttons: Alpha · Beta]',
    ]);
    expect(tidyControls(['`````', '````', literal, '`````'].join('\n'))).toContain(literal);
  });

  it('handles fences indented up to three spaces, inside list items, and unclosed fences', () => {
    expect(tidyControls(['   ```', literal, '   ```', literal].join('\n')).split('\n')[1]).toBe(
      literal,
    );
    expect(tidyControls(['-   item', '    ```', `    ${literal}`, '    ```'].join('\n'))).toContain(
      `    ${literal}`,
    );
    expect(tidyControls(['```js', literal].join('\n'))).toContain(literal);
    // A backtick "fence" whose info string contains a backtick is not a fence.
    expect(tidyControls(['``` a`b', literal].join('\n'))).toContain('[Buttons: Alpha · Beta]');
  });

  it('leaves inline code spans alone but still spaces controls outside them', () => {
    expect(tidyControls(`Use \`${literal}\` then [Image: x][Button: Go]`)).toBe(
      `Use \`${literal}\` then [Image: x] [Button: Go]`,
    );
    expect(tidyControls(`\`\`a \` ${literal}\`\` ${literal}`)).toBe(
      `\`\`a \` ${literal}\`\` [Button: Alpha] [Button: Beta]`,
    );
  });

  it('does not resolve, label or drop links inside inline or block code', () => {
    const markdown = buildStructuredMarkdown(
      draft(`<html><body><main>
        <p>Run <code>${literal}</code>, <code><a href="/rel">/rel</a></code> and <code><a href="#"></a>x</code>.</p>
        <pre><code>\`\`\`
${literal}
<a href="/inside">/inside</a><a href="#"></a>
\`\`\`</code></pre>
        <p><a href="/out">out</a></p></main></body></html>`),
    );
    expect(markdown).toContain(`\`${literal}\``);
    // Code that is wholly one link keeps its target outside the span.
    expect(markdown).toContain('[`/rel`](https://console.example.test/rel)');
    expect(markdown).not.toContain('`[/rel]');
    expect(markdown).toContain(`\`\`\`\`\n\`\`\`\n${literal}\n/inside\n\`\`\`\n\`\`\`\``);
    expect(markdown).not.toContain('[Link:');
    expect(markdown).toContain('[out](https://console.example.test/out)');
  });
});
