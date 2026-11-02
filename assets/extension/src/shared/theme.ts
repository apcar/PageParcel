import type { Settings } from './types';

/** Follow appearance changes while a System-themed surface is open. */
export function watchTheme(theme: Settings['theme']): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const update = () => {
    const dark = theme === 'dark' || (theme === 'system' && media.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  };
  update();
  if (theme === 'system') media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}
