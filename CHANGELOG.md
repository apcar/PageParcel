# Changelog

All notable changes to PageParcel are documented here.

## 0.3.0 - 2026-11-01

### Removed

- **Local OCR.** The opt-in Page Text OCR option, its Tesseract.js engine, and its English data are gone before release. This drops about 14.8 MB from the extension and removes `'wasm-unsafe-eval'` from the content security policy. This is a real loss of capability: **Text only** (Page Text) no longer extracts text from images, canvases, or scanned content, so a Text only file can miss words that appear only inside pictures. Screenshots still show that text, so use **Save Page** or an image capture when it matters, and read it with a separate OCR or AI tool.

### Added

- **A simpler popup.** A light theme by default, with one blue **Save Page** button (Trace Bundle) and a "Just one part" list: Text only, Full page image, Visible area image, and Select image area. Line icons replace emoji. Only the Save Page shortcut is shown, and the shortcut link moved into Settings.
- **A grouped Settings screen.** Appearance, Saving, PDF, and Keyboard shortcuts. Quality appears only for JPEG and WebP, and PDF options are collapsed unless PDF is the default format.
- **Readable file names for everything, with no `PageParcel-` prefix.** Every output uses the File name setting, which now defaults to `{date}_{title}_{type}`, for example `2026-11-01_Sallie Mae - Wikipedia_bundle.zip`. Types are `bundle`, `text`, `full-page`, `visible`, and `region`, and a new `{type}` token is added to custom templates that leave it out. Titles lose characters that macOS and Windows don't allow, collapse whitespace, stop at 80 characters, and fall back to `page`. `find_latest_bundle.py` finds both the new names and older `PageParcel-*` names.
- **A one-line privacy note** under the popup buttons: "Everything is local and runs on your computer. Password fields are redacted from text."
- **Page Text**: a standalone Markdown capture of the visible page text, with conservative navigation cleanup, heading and boundary preservation, export-copy filtering, and an Advanced option for duplicate recovery.
- **Verifiable Page Text.** Each file carries `pageparcel_schema: page-text/1.0`, a `generator` line, and a `pageparcel_sha256` seal over its own contents.
- **Trace Bundle schema 1.1.**
  - Bundles add `page-text.md`, an `extraction` block recording whether Page Text is included, the reader-to-structured text ratio, and a sparse-reader flag.
  - On app pages that scroll an inner panel, bundles add `page-viewport.png` so the sidebar and header are kept.
- **`scripts/verify_bundle.py`.** Accepts ZIPs, folders and Page Text files, and supports `--json`.
  - Only the file names PageParcel writes are allowed.
  - It rejects unregistered, duplicate, symlinked, nested, special or executable-mode files.
  - It validates the shape of `page.json`, so malformed input gives a structured error instead of a crash.
- **`scripts/find_latest_bundle.py`.** Finds the newest Trace Bundle, Page Text file or extracted folder, with `--kind`, `--since`, `--dir`, `--all` and `--json`.
- **Agent and design docs.** `docs/agents.md` explains how agents use PageParcel today. `docs/design/native-messaging-mcp.md` is a reviewed proposal for agent-triggered capture.
- `docs/testing.md` and `scripts/ci_local.sh`, which runs every CI gate locally.

### Changed

- **No welcome screen.** The first-run onboarding card and its `showOnboarding` setting are gone; the popup opens straight to its buttons.
- **Fixed dull image file names.** Earlier builds saved their default template (`screenshot_{date}_{time}`) into storage on the first settings change, so later defaults never applied and image exports had no page title. Old default templates are now treated as unset, and editor exports use the capture's title and time.
- The public sample files are now `docs/examples/sample_bundle.zip` and `docs/examples/sample_text.md`.

- **Structured Markdown on app-style pages.**
  - Relative links resolve against the page URL; empty `#` links and non-web schemes are dropped.
  - Icon-only links read as `[Link: label](url)`.
  - Runs of buttons collapse into `[Buttons: A · B]`.
  - Adjacent layout blocks no longer run together.
  - Fenced code (CommonMark rules) and inline code are never rewritten. Inline code that is wholly one link keeps its target.
- **Editable areas** (drafts, rich-text editors) are excluded from all three Markdown outputs, not only Page Text.
- **Stitched captures.** Overlay scrollbars that take no layout space are hidden during stitching, so thumbs no longer repeat down the image. Captures use the content width, excluding the scrollbar.
- **Redaction.**
  - Coverage widened to aria-label and placeholder text, and to passcodes, private keys, card CVC/expiry, one-time codes, SSN, IBAN, and account and routing numbers.
  - Text areas are now redacted as well.
  - Script-bearing URLs are removed from the sanitized snapshot.
- **CSP.** Adds `default-src 'self'`, `font-src 'self'`, `base-uri 'none'` and `form-action 'none'`.
- **Security audit.** Now checks the source, built and committed manifests, forbidden manifest keys, and lockfile provenance.
- **CI and release.**
  - Install with `--ignore-scripts` and do not persist checkout credentials.
  - CI checks that the committed unpacked extension matches a fresh build.
  - Release scopes write access to its job.
- **Dependencies.**
  - Defuddle 0.19.3 (pinned exactly), Preact 10.29.8, and @xmldom/xmldom 0.9.12.
  - Development dependencies updated; `npm audit` reports 0 vulnerabilities.
- Repository URLs use the canonical `apcar/PageParcel` casing.

### Removed

- Internal agent work logs under `docs/work`, replaced by the public `docs/testing.md`.

## 0.2.0 - 2026-07-21

### Changed

- Rebranded the project as PageParcel with a public-ready product story and visual identity.
- Renamed the original bundle mode to Trace Bundle and changed filenames to `PageParcel-*.zip`.
- Added repository governance, security guidance, continuous integration, and explicit integrity limitations.
- Added an explicit privacy notice, public example bundle, release packaging, issue templates, and dependency update configuration.
- Added Andrew Greene as creator and maintainer.

### Preserved

- Local-only capture processing and downloads.
- Active-tab invocation with no host permissions.
- Structured Markdown, reader Markdown, PNG segments, source metadata, and SHA-256 artifact hashes.
- Full-page, visible-area, region, annotation, clipboard, image, and PDF workflows.

## 0.1.0 - 2026-07-20

- Initial private prototype based on the pinned OpenScreenShot capture and editor foundation.
