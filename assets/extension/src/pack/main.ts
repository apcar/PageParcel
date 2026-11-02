import './pack.css';
import { buildCapturePack } from './build';
import { clearCapturePackDraft, getCapturePackDraft, getSettings } from '../shared/storage';

const status = document.querySelector<HTMLElement>('#status');
const details = document.querySelector<HTMLElement>('#details');
const downloadButton = document.querySelector<HTMLButtonElement>('#download');
let currentUrl: string | null = null;
let currentFilename = '';

function setStatus(message: string, error = false): void {
  if (!status) return;
  status.textContent = message;
  status.dataset.error = error ? 'true' : 'false';
}

function download(): void {
  if (!currentUrl) return;
  const anchor = document.createElement('a');
  anchor.href = currentUrl;
  anchor.download = currentFilename;
  anchor.click();
}

downloadButton?.addEventListener('click', download);

async function main(): Promise<void> {
  try {
    const draft = await getCapturePackDraft();
    if (!draft)
      throw new Error(
        'No pending capture was found. Start a new Trace Bundle from the extension popup.',
      );
    if (details) {
      details.textContent = `${draft.snapshot.title}\n${draft.segments.length} screenshot segment${draft.segments.length === 1 ? '' : 's'} · ${draft.pageWidth} × ${draft.pageHeight}px`;
    }
    setStatus('Building Markdown, metadata, hashes, and ZIP locally…');
    const { filenameTemplate } = await getSettings();
    const pack = await buildCapturePack(draft, filenameTemplate);
    const blobBytes = Uint8Array.from(pack.bytes);
    const blob = new Blob([blobBytes.buffer], { type: 'application/zip' });
    currentUrl = URL.createObjectURL(blob);
    currentFilename = pack.filename;
    downloadButton?.removeAttribute('disabled');
    download();
    await clearCapturePackDraft();
    setStatus('Trace Bundle downloaded. Nothing was uploaded.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not build the Trace Bundle.', true);
  }
}

void main();
