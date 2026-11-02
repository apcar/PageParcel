import './pack.css';
import { setDuplicateOption } from './view';
import { buildPageText, sealPageText } from './build';
import type { PageSnapshot } from '../shared/types';
import { getSettings } from '../shared/storage';

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
    await chrome.storage.local.remove(key);
    const includeNavigation = document.querySelector<HTMLInputElement>('#include-navigation')!;
    const includeCopies = document.querySelector<HTMLInputElement>('#include-presentation-copies')!;
    const version = chrome.runtime.getManifest().version;
    // The integrity line covers the whole file.
    const sealedUrl = async (markdown: string) =>
      URL.createObjectURL(
        new Blob([await sealPageText(markdown, version)], {
          type: 'text/markdown;charset=utf-8',
        }),
      );
    const { filenameTemplate } = await getSettings();
    let result = buildPageText(snapshot, false, false, filenameTemplate);
    setDuplicateOption(result.presentationCopiesRemoved);
    let url = await sealedUrl(result.markdown);
    const regenerate = async () => {
      button.disabled = true;
      result = buildPageText(
        snapshot,
        includeNavigation.checked,
        includeCopies.checked,
        filenameTemplate,
      );
      URL.revokeObjectURL(url);
      url = await sealedUrl(result.markdown);
      button.disabled = false;
      status.textContent = 'Options changed. Download Markdown to save this version.';
    };
    includeNavigation.addEventListener('change', () => void regenerate());
    includeCopies.addEventListener('change', () => void regenerate());
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
