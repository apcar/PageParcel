import type { OcrCapture, OcrSkipReason } from '../ocr/types';

/** Read only a graphic's own pixels. Never screenshot surroundings, fetch, or scroll. */
export async function collectOcrImages(): Promise<OcrCapture> {
  const images: OcrCapture['images'] = [];
  const skipped: NonNullable<OcrCapture['skipped']> = [];
  let candidate = 0;
  let omitted = 0,
    pixels = 0;
  for (const el of document.querySelectorAll<HTMLImageElement | HTMLCanvasElement>('img, canvas')) {
    const style = getComputedStyle(el),
      r = el.getBoundingClientRect();
    if (
      style.display === 'none' ||
      style.visibility !== 'visible' ||
      Number(style.opacity) === 0 ||
      el.closest(
        '[hidden], [aria-hidden="true"], [contenteditable]:not([contenteditable="false"])',
      ) ||
      r.width < 80 ||
      r.height < 30 ||
      r.right <= 0 ||
      r.bottom <= 0 ||
      r.left >= innerWidth ||
      r.top >= innerHeight
    )
      continue;
    const label = (
      el.getAttribute('alt') ||
      el.getAttribute('aria-label') ||
      `${el.tagName.toLowerCase()} graphic ${++candidate}`
    ).slice(0, 200);
    const skip = (reason: OcrSkipReason) => {
      omitted++;
      if (skipped.length < 20) skipped.push({ label, reason });
    };
    const top = document.elementFromPoint(
      Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)),
      Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)),
    );
    if (!top || !(el === top || el.contains(top))) {
      skip('covered');
      continue;
    }
    if (images.length >= 8) {
      skip('image-limit');
      continue;
    }
    const sourceWidth = el instanceof HTMLImageElement ? el.naturalWidth : el.width;
    const sourceHeight = el instanceof HTMLImageElement ? el.naturalHeight : el.height;
    if (!sourceWidth || !sourceHeight) {
      skip('not-loaded');
      continue;
    }
    const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale)),
      height = Math.max(1, Math.round(sourceHeight * scale));
    if (pixels + width * height > 4_000_000) {
      skip('pixel-limit');
      continue;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        skip('canvas-unavailable');
        continue;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(el, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png'); // CORS-tainted graphics fail closed.
      images.push({ label, dataUrl });
      pixels += width * height;
    } catch (error) {
      skip(
        error instanceof Error && error.name === 'SecurityError'
          ? 'browser-security'
          : 'read-failed',
      );
    }
  }
  return { images, omitted, skipped };
}
