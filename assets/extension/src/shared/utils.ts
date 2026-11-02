/** Shared utility helpers used across the extension. */

/** Longest title kept in a file name, in characters. */
export const MAX_TITLE_CHARS = 80;

/** What a saved file contains; used by the {type} token. */
export type OutputType = 'bundle' | 'text' | 'full-page' | 'visible' | 'region';

/**
 * Resolve a filename template (without extension) for any PageParcel output.
 *
 * Supported tokens:
 *   {date}  -> YYYY-MM-DD (local time of the capture)
 *   {time}  -> HHMMSS (local time of the capture)
 *   {title} -> sanitized page title, at most 80 characters (fallback: "page")
 *   {type}  -> bundle, text, full-page, visible, or region
 *   {w}     -> image width in px
 *   {h}     -> image height in px
 *
 * When a type is given and the template has no {type} token, "_{type}" is
 * appended, so every output stays recognizable to find_latest_bundle.py.
 */
export function formatFilename(
  template: string,
  ctx: { title?: string; width?: number; height?: number; type?: OutputType; date?: Date },
): string {
  const at = ctx.date && !Number.isNaN(ctx.date.getTime()) ? ctx.date : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  const title = sanitizeTitle(ctx.title ?? '');
  let tmpl = template.trim() || DEFAULT_FILENAME_TEMPLATE;
  if (ctx.type && !tmpl.includes('{type}')) tmpl = `${tmpl}_{type}`;

  const name = tmpl
    .replaceAll('{date}', date)
    .replaceAll('{time}', time)
    .replaceAll('{title}', title)
    .replaceAll('{type}', ctx.type ?? '')
    .replaceAll('{w}', String(ctx.width ?? 0))
    .replaceAll('{h}', String(ctx.height ?? 0));
  return sanitizeFilename(name) || title;
}

/** Default template for every output: date, page title, and output type. */
export const DEFAULT_FILENAME_TEMPLATE = '{date}_{title}_{type}';

/** Templates that were shipped defaults before 0.3.0; treated as "not customized". */
export const LEGACY_DEFAULT_TEMPLATES: readonly string[] = [
  'screenshot_{date}_{time}',
  'screenshot_{date}_{time}_{w}x{h}',
  '{date}_{title}',
];

/** Strip characters that are invalid in download filenames across platforms. */
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').trim();
}

/**
 * Make a page title safe for a file name on macOS, Windows, and Linux:
 * drop reserved and control characters, collapse whitespace, trim leading and
 * trailing dots and spaces, cap the length, and fall back to "page".
 */
export function sanitizeTitle(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const capped = Array.from(cleaned).slice(0, MAX_TITLE_CHARS).join('');
  return capped.replace(/^[.\s]+|[.\s]+$/g, '') || 'page';
}

/** True for URLs the extension is not allowed to capture. */
export function isProtectedUrl(url: string | undefined): boolean {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('devtools://') ||
    url.startsWith('about:') ||
    // Chrome blocks script injection on both Web Store hosts (old + current).
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com')
  );
}
