# Testing PageParcel

This page summarizes how PageParcel is tested and what has and has not been verified.

## Automated gates (every push and pull request)

`bash scripts/ci_local.sh` runs the same gates as `.github/workflows/ci.yml`:

| Gate | What it checks |
| --- | --- |
| `npm run format:check` | Prettier formatting |
| `npm run lint` | ESLint and typescript-eslint rules |
| `npm run typecheck` | Strict TypeScript |
| `npm test` | Vitest unit suite (Markdown structure, redaction, tables, navigation cleanup, bundle construction, Page Text routing, PDF writer, geometry) |
| `npm run build` | Production Vite build |
| `scripts/security_audit.py` | Manifest permissions, empty host permissions, CSP, no first-party network APIs, synchronous Defuddle, no OCR assets or dependencies |
| `scripts/verify_bundle.py --self-test` | The verifier rejects tampered, unsafe, or incomplete bundles |
| Public sample rebuild | `docs/examples/sample_bundle.zip` rebuilds byte-for-byte and verifies |
| Distribution check | The committed `assets/extension-dist` is identical to a fresh build |

## Public-page capture matrix (Page Text)

Real Chrome toolbar captures of public pages, compared with the live DOM. Raw captures are not stored in the repository.

| Page | Result |
| --- | --- |
| GitHub README (tesseract.js) | All six code blocks come out as fenced code and match the live `<pre>` text exactly, including whitespace and punctuation. |
| Wikipedia, *Printing press* | All article headings retained; MediaWiki tabs/Appearance/footer navigation removed; attribution and table link destinations preserved. Limitation: the separate Contents sidebar is not included. |
| MDN, `<table>` reference | 17 visible code examples become 17 fenced blocks; 7 hidden copies excluded; sampled HTML and CSS match exactly; table links retained. Limitation: nested interactive demos and frames are excluded. |
| Project Gutenberg, *Pride and Prejudice* (full HTML) | 61 of 61 chapter headings, opening paragraph, final paragraph and colophon retained; `truncated: false`. Not a paragraph-by-paragraph equality audit. |

## Local browser fixtures

`assets/extension/tests/browser/` contains harmless local pages for exercising the export options:

- Export options: "Advanced" starts collapsed; **Keep duplicate page copies** appears only when copies were actually removed, and toggles reversibly.

## Not covered by automation

Screenshot stitching, scrolling, and the popup run only in a real browser. Check them by hand before a release (see the release checklist in `CONTRIBUTING.md`).
