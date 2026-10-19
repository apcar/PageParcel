import './pack.css';
import { setDuplicateOption } from './view';
import { buildPageText, sealPageText } from './build';
import { ocrMarkdown } from '../ocr/markdown';
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
    const stored = {
      ...(await chrome.storage.local.get(key)),
      ...(await chrome.storage.session.get(key)),
    };
    const snapshot = stored[key] as PageSnapshot | undefined;
    if (!snapshot) throw new Error('No pending page text. Start a new capture from PageParcel.');
    await Promise.all([chrome.storage.local.remove(key), chrome.storage.session.remove(key)]);
    if (snapshot.ocr) {
      const { recognizeImages } = await import('../ocr/recognize');
      await recognizeImages(snapshot.ocr, (message) => {
        status.textContent = message;
      });
    }
    const ocrText = snapshot.ocr ? ocrMarkdown(snapshot.ocr) : '';
    const includeNavigation = document.querySelector<HTMLInputElement>('#include-navigation')!;
    const includeCopies = document.querySelector<HTMLInputElement>('#include-presentation-copies')!;
    const version = chrome.runtime.getManifest().version;
    // Seal after OCR text is appended so the integrity line covers the whole file.
    const sealedUrl = async (markdown: string) =>
      URL.createObjectURL(
        new Blob([await sealPageText(markdown, version)], {
          type: 'text/markdown;charset=utf-8',
        }),
      );
    let result = buildPageText(snapshot);
    setDuplicateOption(result.presentationCopiesRemoved);
    let url = await sealedUrl(result.markdown + ocrText);
    const regenerate = async () => {
      button.disabled = true;
      result = buildPageText(snapshot, includeNavigation.checked, includeCopies.checked);
      URL.revokeObjectURL(url);
      url = await sealedUrl(result.markdown + ocrText);
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
    await Promise.all([chrome.storage.local.remove(key), chrome.storage.session.remove(key)]);
    await download();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not prepare Page Text.';
    status.dataset.error = 'true';
    await Promise.all([chrome.storage.local.remove(key), chrome.storage.session.remove(key)]);
  }
}
void main();
