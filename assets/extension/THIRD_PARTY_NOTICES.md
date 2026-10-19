# Third-party notices

This project is based on OpenScreenShot at commit `7c8a2a9`, distributed under the MIT license retained in `LICENSE`.

Runtime dependencies include Defuddle 0.19.3, Turndown 7.2.4, fflate 0.8.3, Preact 10.29.8, and (through Defuddle) @xmldom/xmldom 0.9.12, each distributed under the MIT license. Full dependency versions are recorded in `package-lock.json`.

Optional local OCR uses Tesseract.js 7.0.0 and tesseract.js-core 7.0.0 (Apache-2.0). Their license files are shipped under `ocr/`. English data is from @tesseract.js-data/eng 1.0.0, the 4.0.0_best_int variant (package metadata: MIT; Tesseract trained data provenance: https://github.com/naptha/tessdata). Exact package integrity is recorded in package-lock.json; bundled asset SHA-256 hashes are in ocr/assets.json.
