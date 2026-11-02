import { afterEach, expect, it, vi } from 'vitest';
import { watchTheme } from '../../src/shared/theme';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const media = Object.assign(new EventTarget(), { matches: false });
  const setAttribute = vi.fn();
  vi.stubGlobal('window', { matchMedia: () => media });
  vi.stubGlobal('document', { documentElement: { setAttribute } });
  return { media, setAttribute };
}

it('follows system changes in both directions while open', () => {
  const { media, setAttribute } = fixture();
  const stop = watchTheme('system');
  expect(setAttribute).toHaveBeenLastCalledWith('data-theme', 'light');
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  expect(setAttribute).toHaveBeenLastCalledWith('data-theme', 'dark');
  media.matches = false;
  media.dispatchEvent(new Event('change'));
  expect(setAttribute).toHaveBeenLastCalledWith('data-theme', 'light');
  stop();
});

it('removes the listener when a surface closes or changes theme', () => {
  const { media, setAttribute } = fixture();
  const stop = watchTheme('system');
  stop();
  setAttribute.mockClear();
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  expect(setAttribute).not.toHaveBeenCalled();
});

it('keeps an explicit theme when system appearance changes', () => {
  const { media, setAttribute } = fixture();
  const stop = watchTheme('dark');
  expect(setAttribute).toHaveBeenLastCalledWith('data-theme', 'dark');
  setAttribute.mockClear();
  media.dispatchEvent(new Event('change'));
  expect(setAttribute).not.toHaveBeenCalled();
  stop();
});
