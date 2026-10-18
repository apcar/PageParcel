import Defuddle from 'defuddle';
import { removeKnownSiteControls } from './site-controls';
import { tableMarkdown } from './tables';
import { removePresentationCopies } from './presentation';
import { strToU8, zipSync } from 'fflate';
import TurndownService from 'turndown';
import type { CapturePackDraft, PageSnapshot } from '../shared/types';
import { safeFileStem, sha256 } from '../shared/pack';

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

function createTurndown(pageText = false): TurndownService {
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
      const label =
        input.getAttribute('aria-label') || input.name || input.id || input.type || 'field';
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
      const values = Array.from(select.selectedOptions)
        .map((option) => option.textContent?.trim())
        .filter(Boolean);
      return `[${label}: ${values.join(', ')}]`;
    },
  });
  service.addRule('buttons', {
    filter: 'button',
    replacement: (content, node) =>
      `[Button: ${content.trim() || (node as HTMLElement).getAttribute('aria-label') || 'unlabeled'}]`,
  });
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
  return service;
}

function documentFromHtml(html: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  sanitizeDocument(doc);
  return doc;
}

export function buildStructuredMarkdown(draft: { snapshot: PageSnapshot }): string {
  const doc = documentFromHtml(draft.snapshot.html);
  const markdown = createTurndown().turndown(doc.body?.innerHTML || '');
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
  const markdown = createTurndown().turndown(content);
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

function timestampStem(iso: string): string {
  const date = new Date(iso);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return safe
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export async function buildCapturePack(draft: CapturePackDraft): Promise<BuiltCapturePack> {
  const files: Record<string, Uint8Array> = {};
  files['page.md'] = strToU8(buildStructuredMarkdown(draft));
  files['page-reader.md'] = strToU8(buildReaderMarkdown(draft));

  for (let i = 0; i < draft.segments.length; i++) {
    const name =
      draft.segments.length === 1 ? 'page.png' : `page-${String(i + 1).padStart(3, '0')}.png`;
    files[name] = dataUrlToBytes(draft.segments[i].dataUrl);
  }

  const artifacts = [];
  for (const [name, bytes] of Object.entries(files)) {
    artifacts.push({ name, bytes: bytes.length, sha256: await sha256(bytes) });
  }
  const manifest = {
    schema_version: '1.0',
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
    filename: `PageParcel-${timestampStem(draft.snapshot.capturedAt)}-${safeFileStem(draft.snapshot.title)}.zip`,
    manifest,
  };
}

/** Faithful loaded-page text, without reader heuristics or image capture. */
export function buildPageText(
  snapshot: PageSnapshot,
  includeNavigation = false,
  includePresentationCopies = false,
): { markdown: string; filename: string; presentationCopiesRemoved: number } {
  const doc = documentFromHtml(snapshot.html);
  doc
    .querySelectorAll('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
    .forEach((el) => el.remove());
  doc.querySelectorAll('a[href]').forEach((link) => {
    try {
      const url = new URL(link.getAttribute('href') || '', snapshot.url);
      if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol))
        link.setAttribute('href', url.href);
      else link.removeAttribute('href');
    } catch {
      link.removeAttribute('href');
    }
  });
  const presentationRemoved = includePresentationCopies ? 0 : removePresentationCopies(doc);
  const navigationRemoved = includeNavigation ? 0 : removeSiteNavigation(doc);
  const body = createTurndown(true)
    .turndown(doc.body?.innerHTML || '')
    .trim();
  if (!body && !snapshot.ocr)
    throw new Error('No page text was found. Try a screenshot for graphical content.');
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
    markdown: `${metadata}${snapshot.ocr ? limits.replace('no scrolling, OCR,', 'no scrolling,').replace('Image labels are not OCR.', 'Image labels are not OCR; separately recognized text is appended below.') : limits}${warning}${componentNotice}${presentationRemoved ? '> Matching off-canvas presentation copies omitted. Use Advanced → Keep duplicate page copies on the export page to retain them.\n' : ''}${navigationRemoved ? '> Site navigation omitted. Use Include site navigation on the export page to retain it.\n' : ''}\n${body}\n`,
    filename: `PageParcel-${timestampStem(snapshot.capturedAt)}-${safeFileStem(snapshot.title)}.md`,
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
