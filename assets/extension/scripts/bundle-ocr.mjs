import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js/LICENSE.md', 'LICENSE-tesseract.txt'],
  ['tesseract.js-core/LICENSE', 'LICENSE-core.txt'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
  ...['lstm', 'simd-lstm', 'relaxedsimd-lstm'].map((name) => [
    `tesseract.js-core/tesseract-core-${name}.wasm.js`,
    `tesseract-core-${name}.wasm.js`,
  ]),
];
await mkdir('public/ocr', { recursive: true });
const hashes = {};
for (const [source, name] of files) {
  await copyFile(`node_modules/${source}`, `public/ocr/${name}`);
  hashes[name] = createHash('sha256')
    .update(await readFile(`public/ocr/${name}`))
    .digest('hex');
}
await writeFile('public/ocr/assets.json', JSON.stringify(hashes, null, 2) + '\n');
console.log('Bundled offline OCR worker, three LSTM cores, and English data.');
