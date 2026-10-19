#!/usr/bin/env python3
"""Verify PageParcel output: Trace Bundle ZIPs, extracted bundle folders, and sealed Page Text files.

Usage:
  verify_bundle.py PATH [PATH ...] [--json]
  verify_bundle.py --self-test [--json]

Exit status is 0 only when every path verifies.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import stat
import sys
import tempfile
import zipfile

SUPPORTED_SCHEMAS = {"1.0", "1.1"}
REQUIRED = {"page.md", "page-reader.md", "page.json"}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PAGE_TEXT_SCHEMAS = {"page-text/1.0"}
SEAL_LINE = re.compile(rb"^pageparcel_sha256: ([0-9a-f]{64})\n", re.MULTILINE)
SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")


class Bundle:
    """Uniform read access to a ZIP or an extracted folder."""

    def __init__(self, path: pathlib.Path):
        self.path = path
        self.errors: list[str] = []
        self.members: dict[str, bytes] = {}
        if path.is_dir():
            for child in sorted(path.rglob("*")):
                rel = child.relative_to(path).as_posix()
                if child.is_symlink():
                    self.errors.append(f"symbolic link not allowed: {rel}")
                elif child.is_file():
                    if rel.startswith(".") or "/." in rel or rel.endswith(".DS_Store"):
                        continue  # Finder/OS metadata created after download
                    self.members[rel] = child.read_bytes()
        else:
            with zipfile.ZipFile(path) as archive:
                names = archive.namelist()
                if len(names) != len(set(names)):
                    self.errors.append("ZIP contains duplicate member names")
                for info in archive.infolist():
                    if info.is_dir():
                        continue
                    mode = info.external_attr >> 16
                    if stat.S_ISLNK(mode):
                        self.errors.append(f"symbolic link not allowed: {info.filename}")
                        continue
                    self.members[info.filename] = archive.read(info)


def verify_bundle(path: pathlib.Path) -> dict:
    bundle = Bundle(path)
    errors = bundle.errors
    names = set(bundle.members)
    for name in names:
        if name.startswith("/") or "\\" in name or ".." in pathlib.PurePosixPath(name).parts:
            errors.append(f"unsafe path: {name}")
        elif "/" in name or not SAFE_NAME.match(name):
            errors.append(f"unexpected file location or name: {name}")
    missing = REQUIRED - names
    if missing:
        errors.append(f"missing required files: {sorted(missing)}")
        return result("trace-bundle", path, errors)
    try:
        manifest = json.loads(bundle.members["page.json"])
    except Exception as exc:  # noqa: BLE001 - report any parse failure
        errors.append(f"invalid page.json: {exc}")
        return result("trace-bundle", path, errors)
    schema = manifest.get("schema_version")
    if schema not in SUPPORTED_SCHEMAS:
        errors.append(f"unsupported schema_version: {schema!r}")
    if not manifest.get("security", {}).get("local_only"):
        errors.append("local_only security marker is absent")
    if manifest.get("security", {}).get("executable_html_included") is True:
        errors.append("bundle declares executable HTML")

    listed: dict[str, dict] = {}
    for item in manifest.get("artifacts", []):
        name = item.get("name")
        if name in listed:
            errors.append(f"artifact registered twice: {name}")
        listed[name] = item
    for name in sorted(names - {"page.json"}):
        if name not in listed:
            errors.append(f"file not registered in page.json: {name}")
    for name, item in sorted(listed.items()):
        if name not in bundle.members:
            errors.append(f"registered artifact missing: {name}")
            continue
        data = bundle.members[name]
        if item.get("sha256") != hashlib.sha256(data).hexdigest():
            errors.append(f"hash mismatch: {name}")
        if item.get("bytes") != len(data):
            errors.append(f"byte count mismatch: {name}")

    pngs = sorted(name for name in names if name.lower().endswith(".png"))
    if not [name for name in pngs if name != "page-viewport.png"]:
        errors.append("no PNG screenshot found")
    for name in pngs:
        if not bundle.members[name].startswith(PNG_SIGNATURE):
            errors.append(f"invalid PNG signature: {name}")
    for name in ("page.md", "page-reader.md"):
        if not bundle.members[name].strip():
            errors.append(f"Markdown artifact is empty: {name}")
    if any(name.lower().endswith((".html", ".htm", ".js", ".svg")) for name in names):
        errors.append("raw HTML, script, or SVG must not be included")
    segments = manifest.get("capture", {}).get("segment_count")
    page_segments = [name for name in pngs if name == "page.png" or re.fullmatch(r"page-\d{3}\.png", name)]
    if isinstance(segments, int) and segments != len(page_segments):
        errors.append(f"segment_count {segments} does not match {len(page_segments)} screenshot segment(s)")
    info = {
        "schema_version": schema,
        "generator": manifest.get("generator"),
        "captured_at": manifest.get("captured_at"),
        "source_url": manifest.get("source", {}).get("url"),
        "artifacts": sorted(listed),
        "dom_snapshot_truncated": manifest.get("capture", {}).get("dom_snapshot_truncated"),
        "reader_sparse": manifest.get("extraction", {}).get("reader_sparse"),
    }
    return result("trace-bundle", path, errors, info)


def front_matter(data: bytes) -> dict[str, str]:
    if not data.startswith(b"---\n"):
        return {}
    end = data.find(b"\n---\n", 4)
    if end < 0:
        return {}
    fields = {}
    for line in data[4:end].decode("utf-8", "replace").splitlines():
        key, sep, value = line.partition(":")
        if sep:
            value = value.strip()
            if value.startswith('"'):
                try:
                    value = json.loads(value)
                except json.JSONDecodeError:
                    pass
            fields[key.strip()] = value
    return fields


def verify_page_text(path: pathlib.Path) -> dict:
    data = path.read_bytes()
    errors: list[str] = []
    fields = front_matter(data)
    if not fields:
        errors.append("missing front matter")
        return result("page-text", path, errors)
    end = data.find(b"\n---\n", 4)
    seals = list(SEAL_LINE.finditer(data, 0, end + 1))
    if fields.get("pageparcel_schema") not in PAGE_TEXT_SCHEMAS:
        errors.append("not a sealed PageParcel Page Text file (saved by PageParcel 0.2.x or edited)")
    elif len(seals) != 1:
        errors.append("expected exactly one pageparcel_sha256 line in the front matter")
    else:
        seal = seals[0]
        unsealed = data[: seal.start()] + data[seal.end():]
        if hashlib.sha256(unsealed).hexdigest() != seal.group(1).decode():
            errors.append("hash mismatch: file changed after it was saved")
    if not data[end + 5:].strip():
        errors.append("Markdown body is empty")
    info = {
        "schema": fields.get("pageparcel_schema"),
        "generator": fields.get("generator"),
        "captured_at": fields.get("captured_at"),
        "source_url": fields.get("source"),
        "truncated": fields.get("truncated"),
    }
    return result("page-text", path, errors, info)


def result(kind: str, path: pathlib.Path, errors: list[str], info: dict | None = None) -> dict:
    return {"path": str(path), "kind": kind, "ok": not errors, "errors": errors, **({"info": info} if info else {})}


def verify(path: pathlib.Path) -> dict:
    path = path.expanduser().resolve()
    try:
        if not path.exists():
            return result("unknown", path, ["path does not exist"])
        if path.is_dir() or zipfile.is_zipfile(path):
            return verify_bundle(path)
        if path.suffix.lower() == ".md":
            return verify_page_text(path)
        return result("unknown", path, ["not a PageParcel ZIP, bundle folder, or Page Text .md file"])
    except (OSError, zipfile.BadZipFile) as exc:
        return result("unknown", path, [f"could not read: {exc}"])


# --- self-test -----------------------------------------------------------------


def _bundle_bytes(files: dict[str, bytes], manifest: dict) -> dict[str, bytes]:
    return {**files, "page.json": json.dumps(manifest).encode()}


def _write_zip(path: pathlib.Path, members: dict[str, bytes]) -> pathlib.Path:
    with zipfile.ZipFile(path, "w") as archive:
        for name, data in members.items():
            archive.writestr(name, data)
    return path


def _seal(markdown: str) -> bytes:
    head, sep, rest = markdown.partition("\n---\n")
    unsealed = f"{head}\npageparcel_schema: page-text/1.0\ngenerator: \"PageParcel self-test\"{sep}{rest}".encode()
    digest = hashlib.sha256(unsealed).hexdigest()
    head2, sep2, rest2 = unsealed.partition(b"\n---\n")
    return head2 + f"\npageparcel_sha256: {digest}".encode() + sep2 + rest2


def self_test() -> list[str]:
    """Return a list of failures; empty means the verifier behaves as specified."""
    temp = pathlib.Path(tempfile.mkdtemp())
    png = PNG_SIGNATURE + b"self-test"
    page = b"# Self test\n"
    files = {"page.md": page, "page-reader.md": page, "page.png": png}
    artifacts = [{"name": n, "bytes": len(d), "sha256": hashlib.sha256(d).hexdigest()} for n, d in files.items()]
    manifest = {"schema_version": "1.1", "security": {"local_only": True}, "capture": {"segment_count": 1}, "artifacts": artifacts}
    failures: list[str] = []

    def expect(label: str, path: pathlib.Path, ok: bool, contains: str = "") -> None:
        outcome = verify(path)
        if outcome["ok"] != ok or (contains and not any(contains in e for e in outcome["errors"])):
            failures.append(f"{label}: got {outcome}")

    expect("valid ZIP", _write_zip(temp / "valid.zip", _bundle_bytes(files, manifest)), True)
    legacy = {**manifest, "schema_version": "1.0"}
    expect("schema 1.0 ZIP", _write_zip(temp / "legacy.zip", _bundle_bytes(files, legacy)), True)
    folder = temp / "folder"
    folder.mkdir()
    for name, data in _bundle_bytes(files, manifest).items():
        (folder / name).write_bytes(data)
    (folder / ".DS_Store").write_bytes(b"finder")
    expect("valid folder", folder, True)
    tampered = {**files, "page.md": b"# Edited\n"}
    expect("tampered", _write_zip(temp / "tampered.zip", _bundle_bytes(tampered, manifest)), False, "hash mismatch: page.md")
    extra = {**files, "notes.md": b"added later"}
    expect("unregistered", _write_zip(temp / "extra.zip", _bundle_bytes(extra, manifest)), False, "not registered")
    html = {**files, "page.html": b"<script>"}
    expect("html", _write_zip(temp / "html.zip", _bundle_bytes(html, manifest)), False, "raw HTML")
    unsafe = {**files, "../escape.md": b"x"}
    expect("unsafe path", _write_zip(temp / "unsafe.zip", _bundle_bytes(unsafe, manifest)), False, "unsafe path")
    missing = {k: v for k, v in files.items() if k != "page-reader.md"}
    expect("missing", _write_zip(temp / "missing.zip", _bundle_bytes(missing, manifest)), False, "missing required")
    bad_segments = {**manifest, "capture": {"segment_count": 2}}
    expect("segment count", _write_zip(temp / "segments.zip", _bundle_bytes(files, bad_segments)), False, "segment_count")

    text = '---\ntitle: "Self test"\nsource: "https://example.test/"\ncaptured_at: "2026-10-19T00:00:00.000Z"\ncapture_variant: page-text\n---\n\n# Self test\n\nBody.\n'
    sealed = temp / "sealed.md"
    sealed.write_bytes(_seal(text))
    expect("sealed Page Text", sealed, True)
    edited = temp / "edited.md"
    edited.write_bytes(_seal(text).replace(b"Body.", b"Body!"))
    expect("edited Page Text", edited, False, "hash mismatch")
    edited_meta = temp / "edited-meta.md"
    edited_meta.write_bytes(_seal(text).replace(b"example.test", b"example.org"))
    expect("edited front matter", edited_meta, False, "hash mismatch")
    unsealed = temp / "unsealed.md"
    unsealed.write_text(text)
    expect("unsealed Page Text", unsealed, False, "not a sealed")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify PageParcel Trace Bundles (ZIP or folder) and sealed Page Text files.")
    parser.add_argument("paths", nargs="*", type=pathlib.Path)
    parser.add_argument("--self-test", action="store_true", help="exercise the verifier against valid and tampered fixtures")
    parser.add_argument("--json", action="store_true", help="print machine-readable results")
    args = parser.parse_args()

    if args.self_test:
        failures = self_test()
        if args.json:
            print(json.dumps({"self_test": "pass" if not failures else "fail", "failures": failures}, indent=2))
        else:
            print("VERIFIER SELF-TEST PASSED" if not failures else "VERIFIER SELF-TEST FAILED")
            for failure in failures:
                print(f"- {failure}")
        return 0 if not failures else 1
    if not args.paths:
        parser.error("provide one or more paths, or --self-test")

    results = [verify(path) for path in args.paths]
    if args.json:
        print(json.dumps(results if len(results) > 1 else results[0], indent=2))
    else:
        for outcome in results:
            label = "TRACE BUNDLE" if outcome["kind"] == "trace-bundle" else "PAGE TEXT" if outcome["kind"] == "page-text" else "PAGEPARCEL FILE"
            if outcome["ok"]:
                print(f"{label} VERIFIED: {outcome['path']}")
            else:
                print(f"{label} INVALID: {outcome['path']}")
                for error in outcome["errors"]:
                    print(f"- {error}")
    return 0 if all(outcome["ok"] for outcome in results) else 1


if __name__ == "__main__":
    sys.exit(main())
