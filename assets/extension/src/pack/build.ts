import Defuddle from 'defuddle';
import { removeKnownSiteControls } from './site-controls';
import { tableMarkdown } from './tables';
import { removePresentationCopies } from './presentation';
import { strToU8, zipSync } from 'fflate';
import TurndownService from 'turndown';
import type { CapturePackDraft, PageSnapshot } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { sha256 } from '../shared/pack';
import { formatFilename } from '../shared/utils';

export interface BuiltCapturePack {
  bytes: Uint8Array;
  filename: string;
  manifest: Record<string, unknown>;
}

function yamlString(value: string): string {
  return JSON.stringify(value.replace(/\r?\n/g, ' '));
}

function frontMatter(draft: { snapshot: PageSnapshot }, variant: string): string {
  return [
    '---',
    `title: ${yamlString(draft.snapshot.title)}`,
    `source: ${yamlString(draft.snapshot.url)}`,
    `captured_at: ${yamlString(draft.snapshot.capturedAt)}`,
    `capture_variant: ${variant}`,
    '---',
    '',
  ].join('\n');
}

function safeHref(value: string): string {
  const trimmed = value.trim();
  return /^(javascript|data|vbscript):/i.test(trimmed) ? '' : trimmed;
}

const LINK_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

/** Resolve links against the captured page URL; drop hrefs that cannot be followed. */
function resolveLinks(doc: Document, baseUrl: string): void {
  doc.querySelectorAll('a[href]').forEach((link) => {
    const raw = (link.getAttribute('href') || '').trim();
    if (!raw || raw === '#') {
      link.removeAttribute('href');
      return;
    }
    try {
      const url = new URL(raw, baseUrl);
      if (LINK_PROTOCOLS.includes(url.protocol)) link.setAttribute('href', url.href);
      else link.removeAttribute('href');
    } catch {
      link.removeAttribute('href');
    }
  });
}

/** Plain-text label for a control: image/icon tokens become words, whitespace collapses. */
export function controlLabel(content: string): string {
  return content
    .replace(/\[(?:Image|Icon): unlabeled\]/g, ' ')
    .replace(/\[(?:Image|Icon): ([^\]]*)\]/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function markdownLinkTarget(href: string): string {
  return href.replace(/([()])/g, '\\$1');
}

interface OpenFence {
  char: string;
  length: number;
  indent: number;
}

/**
 * Fenced-code tracking for Markdown we generate. Follows CommonMark: a fence is
 * three or more backticks or tildes; a backtick fence's info string may not
 * contain a backtick; it closes only on a line of the same character, at least
 * as long, with no info string. An unclosed fence runs to the end. Turndown
 * indents fences inside list items, so an opener may carry the list's
 * indentation; a closer may be indented at most three spaces beyond it.
 */
function fenceOpener(line: string): OpenFence | null {
  const match = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  if (match[2][0] === '`' && match[3].includes('`')) return null;
  return { char: match[2][0], length: match[2].length, indent: match[1].length };
}

function closesFence(line: string, open: OpenFence): boolean {
  const match = /^(\s*)(`{3,}|~{3,})\s*$/.exec(line);
  return (
    !!match &&
    match[2][0] === open.char &&
    match[2].length >= open.length &&
    match[1].length <= open.indent + 3
  );
}

/**
 * Apply `transform` to the parts of one line that are outside inline code
 * spans. A run of N backticks opens a span that closes at the next run of
 * exactly N; an unmatched run is literal text.
 */
function outsideCodeSpans(line: string, transform: (text: string) => string): string {
  if (!line.includes('`')) return transform(line);
  let out = '';
  let plain = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '`') {
      plain += line[i++];
      continue;
    }
    let j = i;
    while (line[j] === '`') j++;
    const ticks = line.slice(i, j);
    const close = new RegExp(`(?<!\`)${ticks}(?!\`)`, 'g');
    close.lastIndex = j;
    const end = close.exec(line);
    if (!end) {
      plain += ticks;
      i = j;
      continue;
    }
    out += transform(plain) + line.slice(i, end.index + ticks.length);
    plain = '';
    i = end.index + ticks.length;
  }
  return out + transform(plain);
}

/**
 * Make runs of interface controls readable without dropping any of them:
 * a line of two or more buttons becomes one `[Buttons: A · B]` record, and
 * adjacent control tokens are separated by a space. Fenced code blocks and
 * inline code spans are never changed.
 */
export function tidyControls(markdown: string): string {
  let fence: OpenFence | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      if (fence) {
        if (closesFence(line, fence)) fence = null;
        return line;
      }
      const opener = fenceOpener(line);
      if (opener) {
        fence = opener;
        return line;
      }
      const run = /^(\s*(?:[-*+]\s+|\d+\.\s+)?)((?:\[Button: [^[\]`]*\]\s*){2,})$/.exec(line);
      if (run) {
        const labels = Array.from(run[2].matchAll(/\[Button: ([^[\]]*)\]/g), (m) => m[1]);
        return `${run[1]}[Buttons: ${labels.join(' · ')}]`;
      }
      return outsideCodeSpans(line, (text) =>
        text
          .replace(/\](?=\[(?:Button|Buttons|Link|Image|Icon)[:\]])/g, '] ')
          .replace(/\)(?=\[(?:Button|Buttons|Image|Icon): )/g, ') '),
      );
    })
    .join('\n');
}

function sanitizeDocument(doc: Document): void {
  doc
    .querySelectorAll('script, style, noscript, template, object, embed, svg')
    .forEach((el) => el.remove());
  doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.startsWith('on') || attr.name === 'srcdoc') el.removeAttribute(attr.name);
    });
  });
  doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const href = safeHref(link.getAttribute('href') || '');
    if (href) link.setAttribute('href', href);
    else link.removeAttribute('href');
  });
  doc.querySelectorAll<HTMLElement>('[src], [srcset]').forEach((el) => {
    el.removeAttribute('src');
    el.removeAttribute('srcset');
  });
}

function createTurndown(pageText = false, reader = false): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
  service.addRule('allPreformattedCode', {
    filter: 'pre',
    replacement: (_content, node) => {
      const pre = (node as HTMLElement).cloneNode(true) as HTMLElement;
      pre.querySelectorAll('button, [role="button"]').forEach((el) => el.remove());
      const text = (pre.textContent || '').replace(/\n$/, '');
      if (!text) return '';
      const classes = `${pre.className} ${pre.querySelector('code')?.className || ''}`;
      const language = /\b(?:language|lang)-([\w+-]+)/.exec(classes)?.[1] || '';
      const fence = '`'.repeat(
        Math.max(3, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length + 1)),
      );
      return `\n\n${fence}${language}\n${text}\n${fence}\n\n`;
    },
  });
  service.addRule('tables', {
    filter: 'table',
    replacement: (_content, node) =>
      tableMarkdown(node as HTMLTableElement, (html) => service.turndown(html)),
  });
  service.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      const image = node as HTMLImageElement;
      return `[Image: ${image.alt || image.getAttribute('aria-label') || 'unlabeled'}]`;
    },
  });
  service.addRule('inputs', {
    filter: 'input',
    replacement: (_content, node) => {
      const input = node as HTMLInputElement;
      const label = (
        input.getAttribute('aria-label') ||
        input.name ||
        input.id ||
        input.type ||
        'field'
      )
        .replace(/<[^>]*>/g, '')
        .trim();
      if (input.type === 'checkbox' || input.type === 'radio') {
        return `${input.checked ? '[x]' : '[ ]'} ${label}`;
      }
      return `[${label}: ${input.value || input.getAttribute('value') || ''}]`;
    },
  });
  service.addRule('selects', {
    filter: 'select',
    replacement: (_content, node) => {
      const select = node as HTMLSelectElement;
      const label = select.getAttribute('aria-label') || select.name || select.id || 'select';
      // The snapshot records selection as attributes; read them rather than live state.
      const values = Array.from(select.querySelectorAll('option'))
        .filter((option) => option.hasAttribute('selected'))
        .map((option) => option.textContent?.trim())
        .filter(Boolean);
      return `[${label}: ${values.join(', ')}]`;
    },
  });
  service.addRule('buttons', {
    filter: 'button',
    replacement: (content, node) =>
      `[Button: ${controlLabel(content) || (node as HTMLElement).getAttribute('aria-label')?.trim() || 'unlabeled'}]`,
  });
  service.addRule('labeledIcons', {
    filter: (node) =>
      node.nodeName === 'SPAN' &&
      (node as HTMLElement).getAttribute('data-pageparcel-icon') === 'true' &&
      !!(node as HTMLElement).getAttribute('aria-label'),
    replacement: (_content, node) => `[Icon: ${(node as HTMLElement).getAttribute('aria-label')}]`,
  });
  if (reader) {
    // Reader view is the low-clutter variant: links with no visible text are omitted.
    service.addRule('readerEmptyLinks', {
      filter: (node) => node.nodeName === 'A' && !(node.textContent || '').trim(),
      replacement: () => '',
    });
  }
  if (!pageText && !reader) {
    service.addRule('structuredLayoutBoundaries', {
      filter: (node) =>
        ['SPAN', 'DIV', 'LABEL'].includes(node.nodeName) &&
        (node as HTMLElement).getAttribute('data-pageparcel-block') === 'true',
      replacement: (content, node) =>
        (node as HTMLElement).closest('button, a, [role="button"]')
          ? ` ${content.trim()} `
          : `\n\n${content.trim()}\n\n`,
    });
    service.addRule('labeledEmptyLinks', {
      filter: (node) =>
        node.nodeName === 'A' &&
        !!(node as HTMLElement).getAttribute('href') &&
        !(node.textContent || '').trim() &&
        !(node as HTMLElement).querySelector('img, input, select, textarea, button'),
      replacement: (_content, node) => {
        const el = node as HTMLElement;
        const label =
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.querySelector('[data-pageparcel-icon="true"]')?.getAttribute('aria-label') ||
          'unlabeled';
        const text = label.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim() || 'unlabeled';
        return `[Link: ${text}](${markdownLinkTarget(el.getAttribute('href') || '')})`;
      },
    });
  }
  if (pageText) {
    service.addRule('semanticHeadings', {
      filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      replacement: (content, node) => {
        const text = content.replace(/\s+/g, ' ').trim();
        return text ? `\n\n${'#'.repeat(Number(node.nodeName.slice(1)))} ${text}\n\n` : '';
      },
    });
    service.addRule('layoutBoundaries', {
      filter: (node) =>
        ['SPAN', 'DIV', 'LABEL'].includes(node.nodeName) &&
        (node as HTMLElement).getAttribute('data-pageparcel-block') === 'true',
      replacement: (content) => `\n\n${content.trim()}\n\n`,
    });
    service.addRule('readableLinks', {
      filter: 'a',
      replacement: (content, node) => {
        const href = (node as HTMLElement).getAttribute('href');
        const label = content.trim().replace(/\s*\n+\s*/g, ' · ');
        if (!label) return '';
        return href
          ? ` [${label}](<${href.replace(/</g, '%3C').replace(/>/g, '%3E')}>) `
          : ` ${label} `;
      },
    });
    service.addRule('separatedImages', {
      filter: 'img',
      replacement: (_content, node) => {
        const label =
          (node as HTMLElement).getAttribute('alt') ||
          (node as HTMLElement).getAttribute('aria-label');
        return label ? ` [Image: ${label}] ` : ' [Image: unlabeled] ';
      },
    });
  }
  // Inline code is literal: links, buttons and icons inside it are not rewritten,
  // resolved or labeled. Uses a backtick fence longer than any run inside.
  service.addRule('literalInlineCode', {
    filter: (node) => node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE',
    replacement: (_content, node) => {
      const text = (node.textContent || '').replace(/\r?\n|\r/g, ' ');
      if (!text.trim()) return text ? ' ' : '';
      const longest = Math.max(0, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length));
      const fence = '`'.repeat(longest + 1);
      const pad = /^`|`$|^ .* $/.test(text) ? ' ' : '';
      const code = `${fence}${pad}${text}${pad}${fence}`;
      // Code that is entirely one link (common in API docs) keeps its target,
      // as a link around the code span rather than link syntax inside it.
      const links = (node as HTMLElement).querySelectorAll('a[href]');
      const href = links.length === 1 ? links[0].getAttribute('href') || '' : '';
      if (href && links[0].textContent?.trim() === text.trim())
        return `[${code}](${pageText ? `<${href}>` : markdownLinkTarget(href)})`;
      return code;
    },
  });
  return service;
}

function documentFromHtml(html: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeDocument(doc);
  return doc;
}

export function buildStructuredMarkdown(draft: { snapshot: PageSnapshot }): string {
  const doc = documentFromHtml(draft.snapshot.html);
  resolveLinks(doc, draft.snapshot.url);
  const markdown = tidyControls(createTurndown().turndown(doc.body?.innerHTML || ''));
  return `${frontMatter(draft, 'structured')}# ${draft.snapshot.title}\n\n${markdown.trim()}\n`;
}

export function buildReaderMarkdown(draft: CapturePackDraft): string {
  const doc = documentFromHtml(draft.snapshot.html);
  let content = doc.body?.innerHTML || '';
  let title = draft.snapshot.title;
  try {
    const parsed = new Defuddle(doc, {
      url: draft.snapshot.url,
      useAsync: false,
      removeImages: true,
    }).parse();
    content = parsed.content || content;
    title = parsed.title || title;
  } catch {
    // A faithful local fallback is better than failing the whole Trace Bundle.
  }
  const markdown = createTurndown(false, true).turndown(content);
  return `${frontMatter(draft, 'reader')}# ${title}\n\n${markdown.trim()}\n`;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Capture segment is not a PNG data URL.');
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Letters and digits only: a markup-independent measure of how much text a variant kept. */
function textWeight(markdown: string): number {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
  return (body.match(/[\p{L}\p{N}]/gu) || []).length;
}

/** Reader extraction often keeps almost nothing on app pages; say so instead of implying completeness. */
export const READER_SPARSE_RATIO = 0.25;
const READER_SPARSE_MIN_TEXT = 400;

export async function buildCapturePack(
  draft: CapturePackDraft,
  filenameTemplate: string = DEFAULT_SETTINGS.filenameTemplate,
): Promise<BuiltCapturePack> {
  const files: Record<string, Uint8Array> = {};
  const structured = buildStructuredMarkdown(draft);
  let reader = buildReaderMarkdown(draft);
  const structuredWeight = textWeight(structured);
  const readerRatio = structuredWeight
    ? Math.min(1, Math.round((textWeight(reader) / structuredWeight) * 1000) / 1000)
    : 1;
  const readerSparse =
    structuredWeight >= READER_SPARSE_MIN_TEXT && readerRatio < READER_SPARSE_RATIO;
  if (readerSparse) {
    reader = reader.replace(
      /\n---\n/,
      `\n---\n\n> Reader view kept about ${Math.round(readerRatio * 100)}% of the page text. page.md (structured) and page-text.md keep more of it, though no text output includes frames, hidden or editable content, anything past the snapshot limit, or page state that was not loaded.\n`,
    );
  }
  files['page.md'] = strToU8(structured);
  files['page-reader.md'] = strToU8(reader);
  let pageTextIncluded = false;
  if (draft.textSnapshot) {
    try {
      files['page-text.md'] = strToU8(buildPageText(draft.textSnapshot).markdown);
      pageTextIncluded = true;
    } catch {
      // A page with no text still gets its screenshot and structured record.
    }
  }

  for (let i = 0; i < draft.segments.length; i++) {
    const name =
      draft.segments.length === 1 ? 'page.png' : `page-${String(i + 1).padStart(3, '0')}.png`;
    files[name] = dataUrlToBytes(draft.segments[i].dataUrl);
  }
  if (draft.viewportContext)
    files['page-viewport.png'] = dataUrlToBytes(draft.viewportContext.dataUrl);

  const artifacts = [];
  for (const [name, bytes] of Object.entries(files)) {
    artifacts.push({ name, bytes: bytes.length, sha256: await sha256(bytes) });
  }
  const manifest = {
    schema_version: '1.1',
    generator: { name: 'PageParcel', version: chrome.runtime.getManifest().version },
    captured_at: draft.snapshot.capturedAt,
    source: {
      url: draft.snapshot.url,
      title: draft.snapshot.title,
      language: draft.snapshot.language,
      description: draft.snapshot.description,
    },
    capture: {
      method: draft.captureMethod,
      width_px: draft.pageWidth,
      height_px: draft.pageHeight,
      device_pixel_ratio: draft.devicePixelRatio,
      segment_count: draft.segments.length,
      dom_snapshot_truncated: draft.snapshot.truncated,
      scroll_container: !!draft.viewportContext,
      ...(draft.viewportContext
        ? {
            viewport_context: {
              artifact: 'page-viewport.png',
              width_px: draft.viewportContext.width,
              height_px: draft.viewportContext.height,
            },
          }
        : {}),
    },
    extraction: {
      page_text_included: pageTextIncluded,
      reader_text_ratio: readerRatio,
      reader_sparse: readerSparse,
    },
    security: {
      local_only: true,
      remote_requests_permitted: false,
      password_and_secret_like_fields_redacted: true,
      executable_html_included: false,
    },
    artifacts,
  };
  files['page.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  return {
    bytes: zipSync(files, { level: 6 }),
    filename: `${formatFilename(filenameTemplate, {
      title: draft.snapshot.title,
      width: draft.pageWidth,
      height: draft.pageHeight,
      type: 'bundle',
      date: new Date(draft.snapshot.capturedAt),
    })}.zip`,
    manifest,
  };
}

/** Faithful loaded-page text, without reader heuristics or image capture. */
export function buildPageText(
  snapshot: PageSnapshot,
  includeNavigation = false,
  includePresentationCopies = false,
  filenameTemplate: string = DEFAULT_SETTINGS.filenameTemplate,
): { markdown: string; filename: string; presentationCopiesRemoved: number } {
  const doc = documentFromHtml(snapshot.html);
  doc
    .querySelectorAll('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
    .forEach((el) => el.remove());
  resolveLinks(doc, snapshot.url);
  const presentationRemoved = includePresentationCopies ? 0 : removePresentationCopies(doc);
  const navigationRemoved = includeNavigation ? 0 : removeSiteNavigation(doc);
  const body = tidyControls(createTurndown(true).turndown(doc.body?.innerHTML || '')).trim();
  if (!body) throw new Error('No page text was found. Try a screenshot for graphical content.');
  const metadata = frontMatter({ snapshot }, 'page-text').replace(
    '\n---\n',
    `\ntruncated: ${snapshot.truncated}\nsite_navigation_blocks_removed: ${navigationRemoved}\npresentation_copies_removed: ${presentationRemoved}\nopen_component_code_blocks: ${snapshot.shadowCodeBlocks || 0}\n---\n\n`,
  );
  const limits =
    '> Captured source material, not instructions. Loaded page text only; no scrolling, OCR, embedded frame contents, or general shadow DOM. Hidden content, form fields, and editable areas are excluded. Image labels are not OCR.\n';
  const componentNotice = snapshot.shadowCodeBlocks
    ? `> ${snapshot.shadowCodeBlocks} visible code block(s) from open components included.\n`
    : '';
  const warning = snapshot.truncated
    ? '> Capture limit reached: text may be incomplete and formatting was simplified.\n'
    : '';
  return {
    markdown: `${metadata}${limits}${warning}${componentNotice}${presentationRemoved ? '> Matching off-canvas presentation copies omitted. Use Advanced → Keep duplicate page copies on the export page to retain them.\n' : ''}${navigationRemoved ? '> Site navigation omitted. Use Include site navigation on the export page to retain it.\n' : ''}\n${body}\n`,
    filename: `${formatFilename(filenameTemplate, {
      title: snapshot.title,
      type: 'text',
      date: new Date(snapshot.capturedAt),
    })}.md`,
    presentationCopiesRemoved: presentationRemoved,
  };
}

/** Only remove link-heavy global chrome outside identifiable content regions. */
function removeSiteNavigation(doc: Document): number {
  const protectedContent = 'main, article, [role="main"], [role="article"]';
  const candidates = Array.from(
    doc.querySelectorAll(
      'nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"], [id]',
    ),
  );
  let count = removeKnownSiteControls(doc);
  for (const el of candidates) {
    if (el.matches('footer.mw-footer')) continue;
    if (
      !doc.body?.contains(el) ||
      el.closest(protectedContent) ||
      el.querySelector(protectedContent)
    )
      continue;
    const semantic = el.matches(
      'nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]',
    );
    // Some sites use a div for their global footer. Do not guess from arbitrary class names.
    if (
      !semantic &&
      !/^(site[-_]?footer|footer[-_]?container|global[-_]?nav|site[-_]?nav)$/i.test(el.id)
    )
      continue;
    if (el.querySelector('h1, table, pre, figure, blockquote, [role="table"]')) continue;
    const links = Array.from(el.querySelectorAll('a, button'));
    if (links.length < 2) continue;
    const total = (el.textContent || '').replace(/\s/g, '').length;
    const linked = links.reduce(
      (n, link) => n + (link.textContent || '').replace(/\s/g, '').length,
      0,
    );
    // Retain substantial prose or ambiguous containers; this is not article extraction.
    if (!total || linked / total < 0.6 || total - linked > 200) continue;
    // Never turn a navigation-directory page into an empty capture.
    const otherText = (doc.body.textContent || '').length - (el.textContent || '').length;
    if (otherText < 40) continue;
    el.remove();
    count++;
  }
  return count;
}

export const PAGE_TEXT_SCHEMA = 'page-text/1.0';
const SEAL_KEY = 'pageparcel_sha256';

/**
 * Make a standalone Page Text file verifiable. Adds generator and schema lines to
 * the front matter, then a `pageparcel_sha256` line: the SHA-256 of the UTF-8 file
 * with that one line removed. It detects later edits to any byte, including the
 * front matter; like the Trace Bundle register it is not a signature or timestamp.
 */
export async function sealPageText(markdown: string, version: string): Promise<string> {
  const end = markdown.indexOf('\n---\n');
  if (!markdown.startsWith('---\n') || end < 0) throw new Error('Page Text front matter missing');
  const head = markdown.slice(0, end);
  const rest = markdown.slice(end);
  const unsealed = `${head}\npageparcel_schema: ${PAGE_TEXT_SCHEMA}\ngenerator: ${yamlString(`PageParcel ${version}`)}${rest}`;
  const digest = await sha256(strToU8(unsealed));
  const close = unsealed.indexOf('\n---\n');
  return `${unsealed.slice(0, close)}\n${SEAL_KEY}: ${digest}${unsealed.slice(close)}`;
}
