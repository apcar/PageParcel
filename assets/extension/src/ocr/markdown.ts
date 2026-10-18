import type { OcrCapture } from './types';
export function ocrMarkdown(capture: OcrCapture): string {
  const lines = [
    '\n## OCR from visible graphics\n',
    '> Local English OCR of readable images/canvases intersecting the viewport. Recognition can be wrong and duplicate page text. No screenshots, map/chart interpretation, SVG, CSS backgrounds, frames, or shadow DOM. Cross-origin restrictions can prevent recognition.\n',
  ];
  if (capture.omitted)
    lines.push(
      `> ${capture.omitted} candidate graphic(s) skipped because of browser restrictions, coverage, or capture limits.\n`,
    );
  if (capture.error) lines.push(`> ${capture.error}\n`);
  if (!capture.results?.length) lines.push('No OCR text was obtained.\n');
  for (const [index, item] of (capture.results || []).entries()) {
    lines.push(`### Graphic ${index + 1}\n`);
    const source = `${item.label}\nOCR confidence: ${Math.round(item.confidence)} / 100 (not a guarantee)\n${item.text || '[No text recognized]'}`;
    const fence = '`'.repeat(
      Math.max(3, ...Array.from(source.matchAll(/`+/g), (match) => match[0].length + 1)),
    );
    lines.push(`${fence}text\n${source}\n${fence}\n`);
  }
  return lines.join('\n');
}
