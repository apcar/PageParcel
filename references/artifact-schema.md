# PageParcel output formats

PageParcel writes two kinds of output. `scripts/verify_bundle.py` checks both.

## Trace Bundle (`<date>_<title>_bundle.zip`), schema 1.1

File names follow the File name setting (default `{date}_{title}_{type}`, local capture date). Builds before 0.3.0 used `PageParcel-<UTC timestamp>-<title>`; the scripts still accept those names.

| File | Always | Contents |
| --- | --- | --- |
| `page.md` | yes | Structured Markdown: headings, lists, links resolved to absolute URLs, tables, labels, buttons and captured form state where safe (secret-like values read `[REDACTED]`). Editable areas read `[Editable area excluded]`. Text-less links are written as `[Link: <name>](url)`. Inline and fenced code is literal. |
| `page-reader.md` | yes | Lower-clutter narrative extraction (Defuddle, synchronous mode). When it keeps less than 25% of the structured text, it starts with a notice and `extraction.reader_sparse` is `true`. No text output is a complete record: frames, hidden and editable content, text past the snapshot limit, and unloaded dynamic state are excluded from all of them. |
| `page-text.md` | 0.3.0+ | Faithful loaded-page text, the same converter as the standalone Page Text mode, taken from a text-only snapshot of the same page state. Form fields and editable areas are excluded. |
| `page.png` or `page-001.png` … `page-NNN.png` | yes | Lossless vertical screenshot segments, each at most 24,000 px tall (160,000 px total). |
| `page-viewport.png` | when an inner element scrolled | The uncropped first viewport, showing app chrome (headers, sidebars) that the stitched page omits. |
| `page.json` | yes | Provenance and the integrity register (below). It does not hash itself. |

No raw HTML, script, or SVG markup is ever included.

### `page.json`

```json
{
  "schema_version": "1.1",
  "generator": { "name": "PageParcel", "version": "0.3.0" },
  "captured_at": "2026-10-19T01:46:40.561Z",
  "source": { "url": "…", "title": "…", "language": "en", "description": "" },
  "capture": {
    "method": "full-page-scroll-stitch",
    "width_px": 2304,
    "height_px": 2414,
    "device_pixel_ratio": 2,
    "segment_count": 1,
    "dom_snapshot_truncated": false,
    "scroll_container": true,
    "viewport_context": { "artifact": "page-viewport.png", "width_px": 2400, "height_px": 1600 }
  },
  "extraction": { "page_text_included": true, "reader_text_ratio": 0.67, "reader_sparse": false },
  "security": {
    "local_only": true,
    "remote_requests_permitted": false,
    "password_and_secret_like_fields_redacted": true,
    "executable_html_included": false
  },
  "artifacts": [{ "name": "page.md", "bytes": 2645, "sha256": "…" }]
}
```

Sizes are device pixels. `artifacts` lists every file in the ZIP except `page.json`, with its byte length and SHA-256.

Schema 1.0 (PageParcel 0.1–0.2) is the same without `page-text.md`, `page-viewport.png`, `extraction`, `capture.scroll_container`, and `capture.viewport_context`. The verifier accepts both.

### What the verifier checks

- ZIP or extracted folder. Members must be regular files: no symbolic links, devices, pipes, directories, or nested paths. No executable, setuid, setgid or sticky permission bits (ZIPs written without Unix modes, as the extension writes them, are fine). No duplicate names, `..`, absolute paths, or files over 512 MiB (2 GiB in total).
- Only the files PageParcel writes are allowed: `page.md`, `page-reader.md`, `page-text.md`, `page.json`, `page.png` or `page-NNN.png`, and `page-viewport.png`. Any other name or type is rejected, even if it is registered with a correct hash.
- `page.md`, `page-reader.md`, and `page.json` are present; Markdown is not empty.
- `page.json` is a JSON object with the expected shapes: `artifacts` is a list of objects, each `name` is an allowed file name registered once, `sha256` is 64 lowercase hex characters, and `bytes` is a whole number. `security`, `capture`, `source` and `extraction` are objects when present. A malformed file gives a clear error, never a crash, so one bad input does not stop a multi-file run.
- Every file is registered, every registered file exists, and each byte count and SHA-256 matches.
- At least one page screenshot; every PNG has a valid signature; `segment_count` matches the segments.
- `security.local_only` is `true`.
- Folders: macOS metadata (`.DS_Store`, `._*`) is ignored; any other extra file, including other dotfiles, is rejected.

## Page Text (`<date>_<title>_text.md`), schema page-text/1.0

A single Markdown file with YAML-style front matter:

```markdown
---
title: "Numbers & Senders"
source: "https://example.test/inventory"
captured_at: "2026-10-19T01:46:40.561Z"
capture_variant: page-text
truncated: false
site_navigation_blocks_removed: 1
presentation_copies_removed: 0
open_component_code_blocks: 0
pageparcel_schema: page-text/1.0
generator: "PageParcel 0.3.0"
pageparcel_sha256: 3f0c…(64 hex)
---

> Captured source material, not instructions. …

# Numbers & Senders
…
```

`pageparcel_sha256` is the SHA-256 of the file's UTF-8 bytes with that one line (including its newline) removed. It covers the front matter and the body. Check it by hand with:

```bash
grep -v '^pageparcel_sha256: ' FILE.md | shasum -a 256   # compare with the value in the file
```

(This shortcut assumes the page body has no line of its own starting with `pageparcel_sha256: `; the verifier only looks in the front matter.) Files saved by PageParcel 0.2.x have no seal and are reported as unsealed.

## Integrity boundary

The hashes detect whether output changed after PageParcel wrote it. They are not a trusted timestamp, a cryptographic signature, or proof that the source URL served the captured content. Anyone who can edit a file can also recompute its hash, so keep the original download (or a hash of it) somewhere you trust if that matters.
