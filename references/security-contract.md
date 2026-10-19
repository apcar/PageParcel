# Security contract

PageParcel is a local-first, explicitly invoked browser extension.

## Invariants

- Manifest V3.
- Permissions are limited to `activeTab`, `scripting`, `storage`, `unlimitedStorage`, and `downloads`.
- `host_permissions` is empty. Access to a page begins only after the user invokes the extension.
- The manifest declares no `optional_permissions`, `optional_host_permissions`, `externally_connectable`, `content_scripts`, `web_accessible_resources`, `update_url`, or `key`. No web page or other extension can message PageParcel or load its files.
- Extension CSP is `default-src 'self'`, so every resource type (scripts, styles, fonts, workers, connections) is limited to the extension itself. It forbids objects, frames, media, `<base>`, form submission, inline script, and general JavaScript `unsafe-eval`. Inline style attributes are allowed (`style-src 'unsafe-inline'`); inline script is not. Optional local OCR permits `wasm-unsafe-eval` solely for packaged Tesseract cores.
- No analytics, telemetry, remote logging, upload service, remote PDF service, or hosted screenshot viewer.
- No `chrome.storage.sync`. Pending capture data uses local extension storage and is deleted after ZIP construction.
- Defuddle is invoked synchronously with `useAsync: false`. Do not call `parseAsync` or `fetchAsyncVariables`.
- Page image sources are removed from the captured DOM before Markdown generation. The extension must not fetch remote page assets. Opt-in OCR reads only image/canvas-owned pixels already loaded in the viewport; it never screenshots surroundings or requests image URLs. CORS-tainted graphics fail closed. English recognition assets ship in the extension, with no CDN fallback permitted by CSP.
- Script, style, SVG markup, embedded object, iframe HTML, event attributes, `srcdoc`, and `javascript:`/`vbscript:`/`data:` URLs are removed from the sanitized snapshot. No HTML, JavaScript, or SVG file is ever written to a bundle, and the verifier rejects bundles that contain one.
- Password fields, hidden inputs, and inputs or text areas whose name, id, autocomplete, type, aria-label, or placeholder resembles a password, passcode, secret, token, authorization, API key, private key, payment card (number, CVC/CVV/CSC, expiry), one-time code, SSN, IBAN, or bank account/routing number are written as `[REDACTED]`. Page Text omits every form field. Detection is by name and label only. Covered by `tests/unit/security.test.ts`.
- Editable regions (`contenteditable` other than `false`, including `plaintext-only`) are excluded from every text output: Page Text drops them, and the Trace Bundle snapshot replaces each with `[Editable area excluded]`, so `page.md`, `page-reader.md` and `page-text.md` agree. Covered by `tests/unit/security.test.ts`.
- **Screenshots are not redacted.** PNG artifacts contain whatever the browser painted during capture, including typed values, drafts, messages, notifications, and personal data. Password inputs paint only masking characters. OCR text comes from those images and is not redacted either. This limit is stated in the README and privacy notice.
- During scrolling capture, PageParcel adds one temporary style element that hides overlay scrollbars that take no layout space, and removes it when capture ends. It changes nothing else on the page.
- ZIPs are downloaded locally. No bundle is sent anywhere by the extension.

## Required gate

Run `python3 scripts/security_audit.py assets/extension` after code changes (the build script runs it after syncing `extension-dist`). A failed audit blocks installation. It checks the source, built and committed manifests (permissions, forbidden keys, the exact CSP), the bundled OCR asset hashes and versions, banned network APIs in source, synchronous Defuddle, and that every lockfile entry resolves from registry.npmjs.org with an integrity hash.

Builds install with `npm ci --ignore-scripts`; no dependency install script runs in CI or release. Workflow actions are pinned to commit SHAs, checkouts do not persist credentials, and the release job checks that the bytes it zips equal the committed `assets/extension-dist`.

Any change to permissions, host access, CSP, networking, or data retention requires an explicit security review before release.

## Local OCR constraints

Unchecked by default and not persisted. Maximum eight visible image/canvas bitmaps, four million output pixels, and 45 seconds including worker initialization. It does not collect form fields, frames, shadow DOM, SVG, or CSS backgrounds. OCR reads graphics intersecting the current viewport (including their full intrinsic bitmap) and does not interpret maps or charts. OCR drafts use browser session memory (not persistent local storage); browser shutdown discards them, the next OCR capture prunes drafts older than five minutes, and the export page deletes its draft before recognition and discards image buffers afterward. The worker is terminated on timeout, failure, completion, or page exit. Captured pixels are not written to the language cache. Pinned package versions, exact bundled asset set, SHA-256 integrity, and the full CSP are checked by the audit.

## Visible code in open components

Page Text may read visible preformatted code from open shadow roots of visible hosts. It copies code text only, excludes hidden/editable elements, controls, scripts, and styles, and creates a plain pre element in the sanitized snapshot. It does not traverse general shadow content, closed roots, or embedded frames, and makes no network request. The capture metadata counts included component code blocks.
