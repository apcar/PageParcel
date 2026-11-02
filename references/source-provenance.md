# Source provenance

PageParcel 0.3.0 is a pinned local-first fork of OpenScreenShot at commit `7c8a2a9`, retained under its MIT license.

Direct runtime components (exact versions resolved in `assets/extension/package-lock.json`):

- OpenScreenShot capture and editor base, MIT.
- Defuddle 0.19.3, MIT, pinned exactly. Used only through synchronous `parse()` with `useAsync: false`.
- Turndown 7.2.4, MIT.
- fflate 0.8.3, MIT.
- Preact 10.29.8, MIT, inherited from the base.

Notable transitive runtime component: @xmldom/xmldom 0.9.12 (MIT), via Defuddle.

The extension source retains the upstream `LICENSE` and adds `THIRD_PARTY_NOTICES.md`. Re-run `bash scripts/build_extension.sh`, `bash scripts/ci_local.sh`, and the manual checks in `CONTRIBUTING.md` before accepting upgrades. Defuddle upgrades change extraction output; compare structured, reader and Page Text output on a few real pages before and after.
