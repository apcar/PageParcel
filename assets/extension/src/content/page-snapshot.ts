import type { PageSnapshot, TileSpec } from '../shared/types';

/** Capture a sanitized, non-executable representation of the current DOM. */
export function collectPageSnapshot(textOnly = false): PageSnapshot {
  const source = document.documentElement;
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = Array.from(source.querySelectorAll<HTMLElement>('*'));
  const copies = Array.from(clone.querySelectorAll<HTMLElement>('*'));
  const secretPattern =
    /(password|passwd|secret|token|api[-_ ]?key|authorization|credit[-_ ]?card)/i;

  for (let i = 0; i < copies.length; i++) {
    const original = originals[i];
    const copy = copies[i];
    if (!original || !copy || !clone.contains(copy)) continue;

    if (
      textOnly &&
      (original.matches(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
      ) ||
        (original.tagName !== 'DETAILS' &&
          original.closest('details:not([open])') &&
          !original.closest('summary')))
    ) {
      copy.remove();
      continue;
    }
    const style = getComputedStyle(original);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      original.hidden ||
      original.getAttribute('aria-hidden') === 'true'
    ) {
      copy.remove();
      continue;
    }

    // Preserve CSS layout boundaries that disappear when styles are removed.
    copy.removeAttribute('data-pageparcel-block');
    copy.removeAttribute('data-pageparcel-presentation-copy');
    if (textOnly) {
      const rect = original.getBoundingClientRect();
      if (
        ['absolute', 'fixed'].includes(style.position) &&
        (rect.right < 0 || rect.bottom < 0) &&
        /share|download|export|print|preview/i.test(`${original.className} ${original.id}`)
      ) {
        copy.setAttribute('data-pageparcel-presentation-copy', 'true');
      }
      const parentDisplay = original.parentElement
        ? getComputedStyle(original.parentElement).display
        : '';
      if (
        ['block', 'flex', 'grid', 'list-item', 'table'].includes(style.display) ||
        ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(parentDisplay)
      ) {
        copy.setAttribute('data-pageparcel-block', 'true');
      }
    }

    for (const attr of Array.from(copy.attributes)) {
      if (attr.name.startsWith('on') || attr.name === 'srcdoc') copy.removeAttribute(attr.name);
    }

    if (original instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
      const descriptor = `${original.name} ${original.id} ${original.autocomplete} ${original.type}`;
      if (original.type === 'hidden') {
        copy.remove();
      } else if (original.type === 'password' || secretPattern.test(descriptor)) {
        copy.value = '[REDACTED]';
        copy.setAttribute('value', '[REDACTED]');
      } else if (original.type === 'checkbox' || original.type === 'radio') {
        copy.toggleAttribute('checked', original.checked);
      } else {
        copy.value = original.value;
        copy.setAttribute('value', original.value);
      }
    } else if (original instanceof HTMLTextAreaElement && copy instanceof HTMLTextAreaElement) {
      copy.textContent = original.value;
    } else if (original instanceof HTMLSelectElement && copy instanceof HTMLSelectElement) {
      Array.from(copy.options).forEach((option, index) => {
        option.toggleAttribute('selected', original.options[index]?.selected ?? false);
      });
    } else if (original instanceof HTMLDetailsElement && copy instanceof HTMLDetailsElement) {
      copy.open = original.open;
    }

    if (copy.tagName === 'IMG') {
      copy.removeAttribute('src');
      copy.removeAttribute('srcset');
      copy.removeAttribute('sizes');
    }
  }

  clone
    .querySelectorAll('script, style, noscript, template, svg, object, embed')
    .forEach((el) => el.remove());
  clone.querySelectorAll('iframe').forEach((frame) => {
    const label = frame.getAttribute('title') || 'embedded frame';
    frame.replaceWith(document.createTextNode(`[${label}]`));
  });
  clone.querySelectorAll('canvas').forEach((canvas) => {
    const label =
      canvas.getAttribute('aria-label') ||
      (textOnly ? 'canvas pixels omitted from page text' : 'canvas content shown in screenshot');
    if (
      textOnly &&
      canvas.closest('h1, h2, h3, h4, h5, h6') &&
      !canvas.getAttribute('aria-label')
    ) {
      canvas.replaceWith(document.createTextNode(canvas.textContent?.trim() || ''));
      return;
    }
    canvas.replaceWith(document.createTextNode(`[${label}]`));
  });

  let html = `<!doctype html>\n${clone.outerHTML}`;
  let truncated = false;
  const maxHtmlLength = 12_000_000;
  if (html.length > maxHtmlLength) {
    const text = (
      textOnly ? clone.querySelector('body')?.textContent || '' : document.body?.innerText || ''
    ).slice(0, 5_000_000);
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = `<!doctype html><html><body><pre>${escaped}</pre></body></html>`;
    truncated = true;
  }

  const description =
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || '';
  return {
    title: document.title || location.hostname || 'Untitled page',
    url: location.href,
    language: document.documentElement.lang || navigator.language || '',
    description,
    html,
    capturedAt: new Date().toISOString(),
    truncated,
  };
}

/** Stitch one bounded vertical segment from already captured viewport tiles. */
export async function stitchTileSegment(
  tiles: TileSpec[],
  width: number,
  segmentStartY: number,
  segmentHeight: number,
  crop: { x: number; y: number; w: number; h: number } | null,
): Promise<string> {
  const load = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('tile load failed'));
      img.src = src;
    });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(segmentHeight));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  for (const tile of tiles) {
    const img = await load(tile.dataUrl);
    const destinationY = tile.y - segmentStartY;
    if (crop) {
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, destinationY, crop.w, crop.h);
    } else {
      ctx.drawImage(img, 0, destinationY, img.naturalWidth, img.naturalHeight);
    }
  }
  return canvas.toDataURL('image/png');
}
