import type { OcrCapture } from './types';

/** Pinned Tesseract.js 7 worker protocol. Owning the worker allows cancellation during startup. */
export async function recognizeImages(
  capture: OcrCapture,
  progress: (message: string) => void,
): Promise<void> {
  capture.results = [];
  if (!capture.images.length) return;
  let worker: Worker | undefined;
  let pending:
    | {
        resolve: (data: { text?: string; confidence?: number }) => void;
        reject: (error: Error) => void;
        id: string;
      }
    | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sequence = 0;
  const stop = () => {
    worker?.terminate();
    pending?.reject(new Error('OCR stopped.'));
    pending = undefined;
  };
  window.addEventListener('pagehide', stop, { once: true });
  try {
    worker = new Worker(chrome.runtime.getURL('ocr/worker.min.js'));
    worker.onmessage = ({ data }) => {
      if (!pending || data.jobId !== pending.id || data.status === 'progress') return;
      const job = pending;
      pending = undefined;
      if (data.status === 'resolve') job.resolve(data.data);
      else job.reject(new Error('Local OCR worker failed.'));
    };
    worker.onerror = () => stop();
    worker.onmessageerror = () => stop();
    const request = (action: string, payload: unknown) =>
      new Promise<{ text?: string; confidence?: number }>((resolve, reject) => {
        const id = String(++sequence);
        pending = { resolve, reject, id };
        worker!.postMessage({ workerId: 'pageparcel-local', jobId: id, action, payload });
      });
    timer = setTimeout(stop, 45_000);
    progress('Loading local English OCR…');
    await request('load', {
      options: { lstmOnly: true, corePath: chrome.runtime.getURL('ocr'), logging: false },
    });
    await request('loadLanguage', {
      langs: ['eng'],
      options: {
        langPath: chrome.runtime.getURL('ocr'),
        gzip: true,
        cacheMethod: 'none',
        lstmOnly: true,
      },
    });
    await request('initialize', { langs: ['eng'], oem: 1, config: {} });
    await request('setParameters', { params: { tessedit_pageseg_mode: '11' } });
    for (let i = 0; i < capture.images.length; i++) {
      progress(`Reading visible graphic ${i + 1} of ${capture.images.length} locally…`);
      const image = capture.images[i];
      const bytes = Uint8Array.from(atob(image.dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
      const data = await request('recognize', {
        image: bytes,
        options: {},
        output: { text: true },
      });
      capture.results.push({
        label: image.label,
        text: (data.text || '').trim(),
        confidence: data.confidence || 0,
      });
    }
  } catch {
    capture.error =
      'OCR could not finish within its local limits. Any partial results are included; page text is preserved.';
  } finally {
    if (timer) clearTimeout(timer);
    stop();
    window.removeEventListener('pagehide', stop);
    capture.images = [];
  }
}
