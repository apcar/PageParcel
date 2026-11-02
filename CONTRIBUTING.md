# Contributing to PageParcel

Thank you for helping make web captures more portable, inspectable, and private by default.

## Before opening a change

1. Open an issue or discussion for changes that affect permissions, networking, storage, bundle structure, or extraction behavior.
2. Keep the permission surface narrow. PageParcel must remain explicitly invoked and active-tab only.
3. Preserve source attribution and third-party notices.

## Development setup

PageParcel uses Node.js 22, npm, and Python 3.

```bash
bash scripts/build_extension.sh   # npm ci --ignore-scripts, tests, build, refresh assets/extension-dist, security audit
bash scripts/ci_local.sh          # every gate in .github/workflows/ci.yml, in order
```

`ci_local.sh` must end with `ALL CI GATES PASSED`. One gate checks that the committed `assets/extension-dist` matches a fresh build, so commit the rebuilt extension together with any source change. Another regenerates the public examples in `docs/examples/` and requires them to be unchanged.

## Pull requests

- Keep changes focused and explain the user-facing behavior.
- Add or update tests for logic changes.
- Include manual capture notes for UI, scrolling, extraction, or export changes.
- Do not add analytics, telemetry, remote capture, remote image loading, sync storage, or broad host permissions.
- Update the bundle schema and verifier together when changing artifact structure.

## Security-sensitive changes

Changes to permissions, CSP, networking, data retention, redaction, DOM sanitization, or archive construction need explicit security review. The automated audit is a minimum gate, not a substitute for review.

## Release checklist

1. Bump `version` in `assets/extension/package.json` (and the lockfile root), `assets/extension/manifest.json`, `CITATION.cff`, `VERSION` in `scripts/build_public_sample.py`, and the bug-report placeholder. The built manifest takes its version from `package.json`.
2. Add a `CHANGELOG.md` entry. Update `references/source-provenance.md` and `assets/extension/THIRD_PARTY_NOTICES.md` if runtime dependencies changed.
3. Run `bash scripts/build_extension.sh`, then `bash scripts/ci_local.sh`, and commit the refreshed `assets/extension-dist` and `docs/examples/`.
4. In Chrome, load `assets/extension-dist` unpacked and check:
   - **Save Page** (Trace Bundle) on an ordinary article. Run `python3 scripts/verify_bundle.py` on the ZIP and confirm the screenshot has no repeated headers or scrollbars.
   - **Save Page** on an app page that scrolls an inner panel (webmail, a dashboard). Expect `page-viewport.png`, the full panel in `page.png`, and no repeated scrollbar thumbs.
   - **Page Text**. Verify the `.md` with the verifier.
   - On the Page Text export page, toggle **Include site navigation**, download again, and confirm the new file verifies.
   - A form with a password and a card-number field: both read `[REDACTED]` in `page.md`.
   - Full Page, Visible Area and Selected Region open the editor; PNG and PDF export work.
   - Keyboard shortcuts in `chrome://extensions/shortcuts` trigger the right modes.
   - No errors in the service worker console.
5. Refresh `docs/assets/pageparcel-popup.png` if the popup changed: render `docs/demo/popup.html` or take a real screenshot.
6. Tag `vX.Y.Z`. The release workflow rebuilds, checks that the result equals the committed `assets/extension-dist`, and publishes the ZIP and checksum.
