/** Shared utility helpers used across the extension. */

/** Longest title kept in a file name, in characters. */
export const MAX_TITLE_CHARS = 80;

/**
 * Resolve a filename template using the current date/time and capture context.
 *
 * Supported tokens:
 *   {date}  -> YYYY-MM-DD
 *   {time}  -> HHMMSS
 *   {title} -> sanitized page title, at most 80 characters (fallback: "page")
 *   {w}     -> image width in px
 *   {h}     -> image height in px
 */
export function formatFilename(
  template: string,
  ctx: { title?: string; width: number; height: number },
): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const title = sanitizeTitle(ctx.title ?? '');

  return template
    .replaceAll('{date}', date)
    .replaceAll('{time}', time)
    .replaceAll('{title}', title)
    .replaceAll('{w}', String(ctx.width))
    .replaceAll('{h}', String(ctx.height));
}

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
