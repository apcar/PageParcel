# Changelog

All notable changes to PageParcel are documented here.

## 0.3.0 - 2026-10-21

### Added

- **Page Text**: a standalone Markdown capture of the visible page text, with conservative navigation cleanup, heading and boundary preservation, export-copy filtering, and an Advanced option for duplicate recovery.
- **Opt-in local OCR** for text inside images and canvases, using bundled Tesseract.js assets only (no CDN, bounded in count, pixels and time).
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
