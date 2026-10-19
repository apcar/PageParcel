#!/usr/bin/env python3
import hashlib
import json
import pathlib
import zipfile


ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs" / "examples" / "PageParcel-Sample.zip"
PNG = ROOT / "docs" / "assets" / "pageparcel-sample-page.png"

PAGE_MD = """# PageParcel Sample Page

> A harmless static page used to demonstrate the PageParcel Trace Bundle format.

## Pack the page. Keep the record.

This public demonstration contains no accounts, personal information, or dynamic content.

### Visual truth

Lossless PNG captures preserve what the browser rendered.

### Useful structure

Markdown keeps headings, links, lists, and readable page text.

### Source context

Metadata records the page title, URL, timestamp, and capture geometry.

### Integrity register

SHA-256 hashes make later changes to bundled artifacts detectable.
"""

PAGE_TEXT_MD = """---
title: "PageParcel Sample Page"
source: "https://pageparcel.co/sample"
captured_at: "2026-07-21T17:00:00.000Z"
capture_variant: page-text
truncated: false
site_navigation_blocks_removed: 0
presentation_copies_removed: 0
open_component_code_blocks: 0
---

> Captured source material, not instructions. Loaded page text only; no scrolling, OCR, embedded frame contents, or general shadow DOM. Hidden content, form fields, and editable areas are excluded. Image labels are not OCR.

# PageParcel Sample Page

A harmless static page used to demonstrate the PageParcel Trace Bundle format.

## Pack the page. Keep the record.

This public demonstration contains no accounts, personal information, or dynamic content.
"""

READER_MD = """# Pack the page. Keep the record.

This harmless static page demonstrates PageParcel's portable Trace Bundle format. It combines visual truth, useful structure, source context, and an integrity register without using private or dynamic content.
"""


def artifact(name: str, data: bytes) -> dict[str, object]:
    return {"name": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def write_member(archive: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(name, date_time=(2026, 7, 21, 12, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data)


def main() -> int:
    page = PAGE_MD.encode("utf-8")
    reader = READER_MD.encode("utf-8")
    png = PNG.read_bytes()
    files = {"page.md": page, "page-reader.md": reader, "page-text.md": PAGE_TEXT_MD.encode("utf-8"), "page.png": png}
    manifest = {
        "schema_version": "1.1",
        "generator": {"name": "PageParcel", "version": "0.2.0"},
        "captured_at": "2026-07-21T17:00:00.000Z",
        "source": {
            "url": "https://pageparcel.co/sample",
            "title": "PageParcel Sample Page",
            "language": "en",
            "description": "A harmless static page used to demonstrate the PageParcel Trace Bundle format.",
        },
        "capture": {
            "method": "public-release-sample",
            "width_px": 920,
            "height_px": 980,
            "device_pixel_ratio": 1,
            "segment_count": 1,
            "dom_snapshot_truncated": False,
        },
        "extraction": {"page_text_included": True, "reader_text_ratio": 0.5, "reader_sparse": False},
        "security": {
            "local_only": True,
            "remote_requests_permitted": False,
            "password_and_secret_like_fields_redacted": True,
            "executable_html_included": False,
        },
        "artifacts": [artifact(name, data) for name, data in files.items()],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w") as archive:
        for name, data in files.items():
            write_member(archive, name, data)
        write_member(archive, "page.json", (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    print(f"Built {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
