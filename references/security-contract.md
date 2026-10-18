# Security contract

PageParcel is a local-first, explicitly invoked browser extension.

## Invariants

- Manifest V3.
- Permissions are limited to `activeTab`, `scripting`, `storage`, `unlimitedStorage`, and `downloads`.
- `host_permissions` is empty. Access to a page begins only after the user invokes the extension.
- Extension CSP permits scripts and connections only to the extension itself. It forbids objects, frames, media, inline script, and general JavaScript `unsafe-eval`. Optional local OCR permits `wasm-unsafe-eval` solely for packaged Tesseract cores; workers and connections remain self-only.
- No analytics, telemetry, remote logging, upload service, remote PDF service, or hosted screenshot viewer.
- No `chrome.storage.sync`. Pending capture data uses local extension storage and is deleted after ZIP construction.
- Defuddle is invoked synchronously with `useAsync: false`. Do not call `parseAsync` or `fetchAsyncVariables`.
- Page image sources are removed from the captured DOM before Markdown generation. The extension must not fetch remote page assets. Opt-in OCR reads only image/canvas-owned pixels already loaded in the viewport; it never screenshots surroundings or requests image URLs. CORS-tainted graphics fail closed. English recognition assets ship in the extension, with no CDN fallback permitted by CSP.
- Script, style, embedded object, iframe HTML, event attributes, and executable raw HTML are excluded from the ZIP.
- Password fields and fields whose descriptors resemble secrets, tokens, authorization, API keys, or payment cards are redacted from Markdown. This does not redact the visual screenshot.
- ZIPs are downloaded locally. No bundle is sent anywhere by the extension.

## Required gate

Run `python3 scripts/security_audit.py assets/extension` after code changes. A failed audit blocks installation.

Any change to permissions, host access, CSP, networking, or data retention requires an explicit security review before release.

## Local OCR constraints

Unchecked by default and not persisted. Maximum eight visible image/canvas bitmaps, four million output pixels, and 45 seconds including worker initialization. It does not collect form fields, frames, shadow DOM, SVG, or CSS backgrounds. OCR reads graphics intersecting the current viewport (including their full intrinsic bitmap) and does not interpret maps or charts. OCR drafts use browser session memory (not persistent local storage); browser shutdown discards them, the next OCR capture prunes drafts older than five minutes, and the export page deletes its draft before recognition and discards image buffers afterward. The worker is terminated on timeout, failure, completion, or page exit. Captured pixels are not written to the language cache. Pinned package versions, exact bundled asset set, SHA-256 integrity, and the full CSP are checked by the audit.
