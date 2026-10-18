import type { OcrCapture, OcrSkipReason } from './types';
export function ocrMarkdown(capture: OcrCapture): string {
  const lines = [
    '\n## OCR from visible graphics\n',
    '> Local English OCR of readable images/canvases intersecting the viewport. Recognition can be wrong and duplicate page text. No screenshots, map/chart interpretation, SVG, CSS backgrounds, frames, or shadow DOM. Cross-origin restrictions can prevent recognition.\n',
  ];
  if (capture.omitted) lines.push(`> ${capture.omitted} candidate graphic(s) skipped.\n`);
  const reasons: Record<OcrSkipReason, string> = {
    covered: 'Covered by another page element at the visibility check point.',
    'image-limit': 'Eight-image limit reached.',
    'not-loaded': 'Image or canvas has no readable pixel dimensions yet.',
    'pixel-limit': 'Four-million-pixel processing limit reached.',
    'browser-security':
      'Browser security blocked pixel access (usually a cross-origin image or tainted canvas).',
    'canvas-unavailable': 'Local canvas context unavailable.',
    'read-failed': 'Pixel read failed; the browser did not provide a more specific reason.',
  };
  for (const [index, skip] of (capture.skipped || []).entries()) {
    lines.push(`### Skipped graphic ${index + 1}\n\n${reasons[skip.reason]}\n`);
    lines.push(literalSource(skip.label));
  }
  const unreported = capture.omitted - (capture.skipped?.length || 0);
  if (unreported > 0)
    lines.push(
      `> ${unreported} further skip reason(s) unavailable or omitted from the bounded diagnostic list.\n`,
    );
  if (capture.error) lines.push(`> ${capture.error}\n`);
  if (!capture.results?.length) lines.push('No OCR text was obtained.\n');
  for (const [index, item] of (capture.results || []).entries()) {
    lines.push(`### Graphic ${index + 1}\n`);
    const source = `${item.label}\nOCR confidence: ${Math.round(item.confidence)} / 100 (not a guarantee)\n${item.text || '[No text recognized]'}`;
    lines.push(literalSource(source));
  }
  return lines.join('\n');
}

function literalSource(source: string): string {
  const fence = '`'.repeat(
    Math.max(3, ...Array.from(source.matchAll(/`+/g), (match) => match[0].length + 1)),
  );
  return `${fence}text\n${source}\n${fence}\n`;
}
