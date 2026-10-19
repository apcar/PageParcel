import type { PageSnapshot, TileSpec } from '../shared/types';

/** Capture a sanitized, non-executable representation of the current DOM. */
export function collectPageSnapshot(textOnly = false): PageSnapshot {
  const hiddenByClosedDetails = (node: HTMLElement): boolean => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.hasAttribute('open')) {
        const summary = Array.from(parent.children).find((child) => child.tagName === 'SUMMARY');
        if (!summary?.contains(node)) return true;
      }
    }
    return false;
  };
  const pruneClosedDetails = (root: HTMLElement) => {
    root.querySelectorAll('details:not([open])').forEach((details) => {
      const summary = Array.from(details.children).find((child) => child.tagName === 'SUMMARY');
      Array.from(details.childNodes).forEach((child) => {
        if (child !== summary) child.remove();
      });
    });
  };
  let shadowCodeBlocks = 0;
  const source = document.documentElement;
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = Array.from(source.querySelectorAll<HTMLElement>('*'));
  const copies = Array.from(clone.querySelectorAll<HTMLElement>('*'));
  // Matched against name, id, autocomplete, type, aria-label and placeholder.
  const secretPattern =
    /(pass(word|wd|code|phrase)|secret|token|api[-_ ]?key|authori[sz]ation|bearer|credit[-_ ]?card|card[-_ ]?(number|num|no)\b|cc-(number|csc|exp)|\bcvv\b|\bcvc\b|\bcsc\b|security[-_ ]?code|one[-_ ]?time[-_ ]?(code|password|pin)|\botp\b|\bssn\b|social[-_ ]?security|private[-_ ]?key|\biban\b|routing[-_ ]?number|account[-_ ]?number)/i;
  const describe = (el: HTMLInputElement | HTMLTextAreaElement) =>
    [
      el.name,
      el.id,
      el.getAttribute('autocomplete') || '',
      el.getAttribute('type') || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('placeholder') || '',
    ].join(' ');

  for (let i = 0; i < copies.length; i++) {
    const original = originals[i];
    const copy = copies[i];
    if (!original || !copy || !clone.contains(copy)) continue;

    if (
      textOnly &&
      (original.matches(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
      ) ||
        hiddenByClosedDetails(original))
    ) {
      copy.remove();
      continue;
    }
    // Editable regions (drafts, comment boxes, rich-text editors) are excluded from
    // every text output. Page Text drops them; Trace Bundle text marks the spot.
    if (original.matches('[contenteditable]:not([contenteditable="false"])')) {
      const marker = document.createElement('span');
      marker.textContent = '[Editable area excluded]';
      copy.replaceWith(marker);
      continue;
    }
    const style = getComputedStyle(original);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      original.hidden ||
      original.getAttribute('aria-hidden') === 'true'
    ) {
      copy.remove();
      continue;
    }

    // Preserve CSS layout boundaries that disappear when styles are removed.
    copy.removeAttribute('data-pageparcel-block');
    copy.removeAttribute('data-pageparcel-presentation-copy');
    copy.removeAttribute('data-pageparcel-icon');
    if (textOnly) {
      const rect = original.getBoundingClientRect();
      if (
        ['absolute', 'fixed'].includes(style.position) &&
        (rect.right < 0 || rect.bottom < 0) &&
        /share|download|export|print|preview/i.test(`${original.className} ${original.id}`)
      ) {
        copy.setAttribute('data-pageparcel-presentation-copy', 'true');
      }
    }
    // Both Page Text and the Trace Bundle's structured Markdown use these marks.
    const parentDisplay = original.parentElement
      ? getComputedStyle(original.parentElement).display
      : '';
    if (
      ['block', 'flex', 'grid', 'list-item', 'table'].includes(style.display) ||
      ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(parentDisplay)
    ) {
      copy.setAttribute('data-pageparcel-block', 'true');
    }

    for (const attr of Array.from(copy.attributes)) {
      if (
        attr.name.startsWith('on') ||
        attr.name === 'srcdoc' ||
        // Script-bearing URLs never reach the snapshot, even though Markdown drops them too.
        (/^(href|src|action|formaction|xlink:href)$/.test(attr.name) &&
          /^\s*(javascript|vbscript|data):/i.test(attr.value))
      )
        copy.removeAttribute(attr.name);
    }

    if (original instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
      const descriptor = describe(original);
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
      copy.textContent = secretPattern.test(describe(original)) ? '[REDACTED]' : original.value;
    } else if (original instanceof HTMLSelectElement && copy instanceof HTMLSelectElement) {
      Array.from(copy.options).forEach((option, index) => {
        option.toggleAttribute('selected', original.options[index]?.selected ?? false);
      });
    } else if (original instanceof HTMLDetailsElement && copy instanceof HTMLDetailsElement) {
      copy.open = original.open;
    }

    // Visible code in open components is source text; do not traverse general shadow content.
    if (textOnly && original.shadowRoot) {
      for (const pre of Array.from(original.shadowRoot.querySelectorAll<HTMLElement>('pre'))) {
        let visible = !hiddenByClosedDetails(pre);
        for (let parent: HTMLElement | null = pre; parent; parent = parent.parentElement) {
          const css = getComputedStyle(parent);
          if (
            css.display === 'none' ||
            css.visibility === 'hidden' ||
            css.opacity === '0' ||
            parent.hidden ||
            parent.getAttribute('aria-hidden') === 'true' ||
            parent.matches(
              'input, textarea, select, button, [contenteditable]:not([contenteditable="false"])',
            )
          )
            visible = false;
        }
        if (!visible) continue;
        const safe = pre.cloneNode(true) as HTMLElement;
        const originals = Array.from(pre.querySelectorAll<HTMLElement>('*'));
        const clones = Array.from(safe.querySelectorAll<HTMLElement>('*'));
        for (let i = 0; i < originals.length; i++) {
          const from = originals[i],
            to = clones[i];
          if (!safe.contains(to)) continue;
          const css = getComputedStyle(from);
          if (
            css.display === 'none' ||
            css.visibility === 'hidden' ||
            css.opacity === '0' ||
            from.hidden ||
            from.getAttribute('aria-hidden') === 'true' ||
            from.matches(
              'script, style, input, textarea, select, button, [role="button"], [contenteditable]:not([contenteditable="false"])',
            )
          )
            to.remove();
        }
        pruneClosedDetails(safe);
        const text = safe.textContent || '';
        if (!text.trim() || copy.textContent?.includes(text)) continue;
        const block = document.createElement('pre');
        block.textContent = text;
        const language = /\b(?:language|lang)-([\w+-]+)/.exec(
          `${pre.className} ${pre.querySelector('code')?.className || ''}`,
        )?.[1];
        if (language) block.className = `language-${language}`;
        copy.append(block);
        shadowCodeBlocks++;
      }
    }

    if (copy.tagName === 'IMG') {
      copy.removeAttribute('src');
      copy.removeAttribute('srcset');
      copy.removeAttribute('sizes');
    }
  }

  if (textOnly) pruneClosedDetails(clone);

  // Keep the accessible name of labeled icons; the vector markup itself is never kept.
  clone.querySelectorAll('svg').forEach((svg) => {
    const label = (svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    if (!label) return;
    const icon = document.createElement('span');
    icon.setAttribute('data-pageparcel-icon', 'true');
    icon.setAttribute('aria-label', label);
    svg.replaceWith(icon);
  });
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
    shadowCodeBlocks,
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
