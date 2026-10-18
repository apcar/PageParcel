import { recognizeImages } from '../../src/ocr/recognize';
import { collectOcrImages } from '../../src/content/ocr-regions';

// Synthetic, loopback-only test harness. No user/browser data or external resources.
Object.defineProperty(window, 'chrome', {
  value: { runtime: { getURL: (path: string) => new URL(`/${path}`, location.origin).href } },
  configurable: true,
});
const canvas = document.querySelector<HTMLCanvasElement>('#fixture')!;
const ctx = canvas.getContext('2d')!;
ctx.fillStyle = '#fff';
ctx.fillRect(0, 0, 1000, 300);
ctx.fillStyle = '#000';
ctx.font = '48px Arial';
ctx.fillText('PAGEPARCEL LOCAL OCR', 30, 70);
ctx.fillText('Invoice 42 Total 125.00', 30, 150);
const capture = await collectOcrImages();
await recognizeImages(capture, (message) => {
  document.querySelector('#status')!.textContent = message;
});
const text = capture.results?.map((item) => item.text).join('\n') || '';
const pass =
  /PAGEPARCEL LOCAL OCR/.test(text) &&
  /Invoice 42/.test(text) &&
  !/PRIVATE|SECRET/.test(text) &&
  !capture.error;
document.querySelector('#status')!.textContent = pass
  ? 'PASS: real local OCR, surrounding field excluded, worker stopped.'
  : 'FAIL: inspect result';
document.querySelector('#result')!.textContent = JSON.stringify(capture, null, 2);
