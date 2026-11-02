import { describe, it, expect, vi } from 'vitest';
import {
  formatFilename,
  LEGACY_DEFAULT_TEMPLATES,
  sanitizeFilename,
  sanitizeTitle,
  isProtectedUrl,
  MAX_TITLE_CHARS,
} from '../../src/shared/utils';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

describe('formatFilename', () => {
  it('replaces date/time/w/h tokens', () => {
    const out = formatFilename('screenshot_{date}_{time}_{w}x{h}', { width: 1920, height: 1080 });
    expect(out).toMatch(/^screenshot_\d{4}-\d{2}-\d{2}_\d{6}_1920x1080$/);
  });

  it('sanitizes and truncates the title token', () => {
    const out = formatFilename('{title}', { title: 'a/b:c?d', width: 10, height: 10 });
    expect(out).toBe('a b c d');
  });

  it('falls back to a default title when none is provided', () => {
    const out = formatFilename('{title}', { width: 1, height: 1 });
    expect(out).toBe('page');
  });

  it('falls back to the default title when the title is empty', () => {
    const out = formatFilename('{title}', { title: '', width: 1, height: 1 });
    expect(out).toBe('page');
  });
});

describe('default file name', () => {
  const at = new Date(2026, 10, 1, 9, 5, 7);
  it('is {date}_{title}_{type}', () => {
    expect(DEFAULT_SETTINGS.filenameTemplate).toBe('{date}_{title}_{type}');
    const out = formatFilename(DEFAULT_SETTINGS.filenameTemplate, {
      title: 'Release notes: v0.3.0 | PageParcel',
      type: 'full-page',
      date: at,
    });
    expect(out).toBe('2026-11-01_Release notes v0.3.0 PageParcel_full-page');
  });
  it('names a bundle like the example', () => {
    const out = formatFilename(DEFAULT_SETTINGS.filenameTemplate, {
      title: 'Sallie Mae - Wikipedia',
      type: 'bundle',
      date: at,
    });
    expect(`${out}.zip`).toBe('2026-11-01_Sallie Mae - Wikipedia_bundle.zip');
  });
  it('covers every output type and has no PageParcel prefix', () => {
    for (const type of ['bundle', 'text', 'full-page', 'visible', 'region'] as const) {
      const out = formatFilename(DEFAULT_SETTINGS.filenameTemplate, { title: 'T', type, date: at });
      expect(out).toBe(`2026-11-01_T_${type}`);
      expect(out.startsWith('PageParcel-')).toBe(false);
    }
  });
  it('appends _{type} to custom templates that lack it', () => {
    expect(formatFilename('{title}', { title: 'Doc', type: 'visible', date: at })).toBe(
      'Doc_visible',
    );
    expect(formatFilename('{type}-{title}', { title: 'Doc', type: 'region', date: at })).toBe(
      'region-Doc',
    );
  });
  it('uses the capture time for {date} and {time}', () => {
    expect(formatFilename('{date}_{time}', { date: at })).toBe('2026-11-01_090507');
  });
  it('falls back to the default template and to "page"', () => {
    expect(formatFilename('  ', { type: 'text', date: at })).toBe('2026-11-01_page_text');
  });
  it('keeps user template text file-safe', () => {
    expect(formatFilename('a/b_{title}', { title: 'X', type: 'text', date: at })).toBe(
      'a_b_X_text',
    );
  });
  it('defaults to the light theme', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('light');
  });
});

describe('settings migration', () => {
  async function loadWith(stored: Record<string, unknown>) {
    vi.stubGlobal('chrome', {
      storage: { local: { get: async () => ({ 'pageparcel:settings': stored }) } },
    });
    const { getSettings } = await import('../../src/shared/storage');
    return getSettings();
  }
  it('replaces frozen legacy default templates with the new default', async () => {
    for (const old of LEGACY_DEFAULT_TEMPLATES) {
      expect((await loadWith({ filenameTemplate: old })).filenameTemplate).toBe(
        '{date}_{title}_{type}',
      );
    }
  });
  it('keeps a customized template and drops showOnboarding', async () => {
    const s = await loadWith({ filenameTemplate: 'mine_{title}', showOnboarding: false });
    expect(s.filenameTemplate).toBe('mine_{title}');
    expect('showOnboarding' in s).toBe(false);
  });
});

describe('sanitizeTitle', () => {
  it('strips characters illegal on macOS and Windows and collapses whitespace', () => {
    expect(sanitizeTitle('  a\\b/c:d*e?f"g<h>i|j \t\n k  ')).toBe('a b c d e f g h i j k');
  });
  it('removes control characters', () => {
    expect(sanitizeTitle('one\u0000two\u001fthree')).toBe('one two three');
  });
  it('trims leading and trailing dots', () => {
    expect(sanitizeTitle('...hidden.')).toBe('hidden');
  });
  it('caps long titles', () => {
    const out = sanitizeTitle('x'.repeat(200));
    expect(out.length).toBe(MAX_TITLE_CHARS);
  });
  it('does not split emoji or other surrogate pairs at the cap', () => {
    const out = sanitizeTitle('😀'.repeat(100));
    expect(Array.from(out)).toHaveLength(MAX_TITLE_CHARS);
    expect(out).not.toMatch(/[\ud800-\udbff]$/);
  });
  it('falls back to page when nothing is left', () => {
    expect(sanitizeTitle('')).toBe('page');
    expect(sanitizeTitle(' ?:* ')).toBe('page');
    expect(sanitizeTitle('...')).toBe('page');
  });
});

describe('sanitizeFilename', () => {
  it('replaces reserved characters with underscores', () => {
    expect(sanitizeFilename('my:file*name?')).toBe('my_file_name_');
  });
  it('trims surrounding whitespace', () => {
    expect(sanitizeFilename('  hi  ')).toBe('hi');
  });
});

describe('isProtectedUrl', () => {
  it('blocks chrome:// pages', () => {
    expect(isProtectedUrl('chrome://settings')).toBe(true);
  });
  it('blocks the web store', () => {
    expect(isProtectedUrl('https://chrome.google.com/webstore/detail/x')).toBe(true);
    expect(isProtectedUrl('https://chromewebstore.google.com/detail/x')).toBe(true);
  });
  it('allows normal https pages', () => {
    expect(isProtectedUrl('https://example.com')).toBe(false);
  });
  it('treats missing urls as protected', () => {
    expect(isProtectedUrl(undefined)).toBe(true);
  });
});
