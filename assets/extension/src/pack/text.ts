import './pack.css';
import { buildPageText } from './build';
import type { PageSnapshot } from '../shared/types';

async function main(): Promise<void> {
  const status = document.querySelector<HTMLElement>('#status')!;
  const details = document.querySelector<HTMLElement>('#details')!;
  const button = document.querySelector<HTMLButtonElement>('#download')!;
  const key = decodeURIComponent(location.hash.slice('#text='.length));
  if (!/^pageparcel:text:[a-f0-9-]+$/.test(key)) {
    status.textContent = 'Invalid Page Text capture.';
    return;
  }
  try {
    const stored = await chrome.storage.local.get(key);
    const snapshot = stored[key] as PageSnapshot | undefined;
    if (!snapshot) throw new Error('No pending page text. Start a new capture from PageParcel.');
    const result = buildPageText(snapshot);
    const url = URL.createObjectURL(
      new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' }),
    );
    window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true });
    button.disabled = false;
    const download = async () => {
      try {
        await chrome.downloads.download({ url, filename: result.filename });
        status.textContent = snapshot.truncated
          ? 'Download started. Capture limit reached: text may be incomplete; see the file notice.'
          : 'Markdown download started. Nothing was uploaded.';
      } catch {
        status.textContent = 'Download could not start. Use Download Markdown to try again.';
      }
    };
    button.addEventListener('click', () => void download());
    details.textContent = `${snapshot.title}\n${snapshot.url}`;
    await chrome.storage.local.remove(key);
    await download();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not prepare Page Text.';
    status.dataset.error = 'true';
    await chrome.storage.local.remove(key);
  }
}
void main();
