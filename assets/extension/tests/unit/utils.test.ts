import { describe, it, expect } from 'vitest';
import {
  formatFilename,
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
  it('is {date}_{title}', () => {
    expect(DEFAULT_SETTINGS.filenameTemplate).toBe('{date}_{title}');
    const out = formatFilename(DEFAULT_SETTINGS.filenameTemplate, {
      title: 'Release notes: v0.3.0 | PageParcel',
      width: 1,
      height: 1,
    });
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}_Release notes v0\.3\.0 PageParcel$/);
  });
  it('defaults to the light theme', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('light');
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
