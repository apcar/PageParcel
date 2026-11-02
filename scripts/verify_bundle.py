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
import subprocess
import sys
import tempfile
import zipfile

SUPPORTED_SCHEMAS = {"1.0", "1.1"}
REQUIRED = {"page.md", "page-reader.md", "page.json"}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PAGE_TEXT_SCHEMAS = {"page-text/1.0"}
SEAL_LINE = re.compile(rb"^pageparcel_sha256: ([0-9a-f]{64})\n", re.MULTILINE)
SHA256 = re.compile(r"^[0-9a-f]{64}$")
# Exactly the files PageParcel writes into a Trace Bundle. Anything else is rejected.
ALLOWED_ARTIFACT = re.compile(r"^(page\.md|page-reader\.md|page-text\.md|page\.json|page\.png|page-\d{3}\.png|page-viewport\.png)$")
# Finder/OS metadata that macOS adds after download; ignored in extracted folders only.
OS_METADATA = re.compile(r"^(\.DS_Store|\._.+|Icon\r)$")
MAX_MEMBER_BYTES = 512 * 1024 * 1024
MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
FORBIDDEN_MODE_BITS = stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH | stat.S_ISUID | stat.S_ISGID | stat.S_ISVTX


def mode_problem(mode: int) -> str | None:
    """Explain why a file mode is not acceptable for a bundle member, or return None."""
    if stat.S_ISLNK(mode):
        return "symbolic link not allowed"
    if stat.S_IFMT(mode) and not stat.S_ISREG(mode):
        return "special file (device, pipe, socket or directory) not allowed"
    if mode & FORBIDDEN_MODE_BITS:
        return f"executable or setuid/setgid/sticky permission not allowed (mode {stat.S_IMODE(mode):o})"
    return None


class Bundle:
    """Uniform read access to a ZIP or an extracted folder."""

    def __init__(self, path: pathlib.Path):
        self.path = path
        self.errors: list[str] = []
        self.members: dict[str, bytes] = {}
        total = 0
        if path.is_dir():
            for child in sorted(path.rglob("*")):
                rel = child.relative_to(path).as_posix()
                if OS_METADATA.match(child.name):
                    continue
                info = child.lstat()
                if stat.S_ISDIR(info.st_mode) and not child.is_symlink():
                    self.errors.append(f"unexpected directory: {rel}")
                    continue
                problem = mode_problem(info.st_mode)
                if problem:
                    self.errors.append(f"{problem}: {rel}")
                    continue
                if info.st_size > MAX_MEMBER_BYTES or total + info.st_size > MAX_TOTAL_BYTES:
                    self.errors.append(f"file too large to be a PageParcel artifact: {rel}")
                    continue
                total += info.st_size
                self.members[rel] = child.read_bytes()
        else:
            with zipfile.ZipFile(path) as archive:
                names = archive.namelist()
                if len(names) != len(set(names)):
                    self.errors.append("ZIP contains duplicate member names")
                for info in archive.infolist():
                    if info.is_dir():
                        self.errors.append(f"unexpected directory: {info.filename}")
                        continue
                    mode = info.external_attr >> 16
                    problem = mode_problem(mode) if mode else None
                    if problem:
                        self.errors.append(f"{problem}: {info.filename}")
                        continue
                    if info.file_size > MAX_MEMBER_BYTES or total + info.file_size > MAX_TOTAL_BYTES:
                        self.errors.append(f"file too large to be a PageParcel artifact: {info.filename}")
                        continue
                    total += info.file_size
                    self.members[info.filename] = archive.read(info)


def name_problem(name: object) -> str | None:
    if not isinstance(name, str) or not name:
        return "artifact name must be a non-empty string"
    if name.startswith("/") or "\\" in name or ".." in pathlib.PurePosixPath(name).parts or ":" in name:
        return "unsafe path"
    if "/" in name:
        return "unexpected file location"
    if name.lower().endswith((".html", ".htm", ".js", ".mjs", ".svg", ".xhtml")):
        return "raw HTML, script, or SVG must not be included"
    if not ALLOWED_ARTIFACT.match(name):
        return "file type not allowed in a Trace Bundle"
    return None


def as_dict(manifest: dict, key: str, errors: list[str], required: bool = False) -> dict:
    value = manifest.get(key)
    if value is None and not required:
        return {}
    if not isinstance(value, dict):
        errors.append(f"page.json: {key} must be an object")
        return {}
    return value


def verify_bundle(path: pathlib.Path) -> dict:
    bundle = Bundle(path)
    errors = bundle.errors
    names = set(bundle.members)
    for name in sorted(names):
        problem = name_problem(name)
        if problem:
            errors.append(f"{problem}: {name}")
    missing = REQUIRED - names
    if missing:
        errors.append(f"missing required files: {sorted(missing)}")
        return result("trace-bundle", path, errors)
    try:
        manifest = json.loads(bundle.members["page.json"])
    except Exception as exc:  # noqa: BLE001 - report any parse failure
        errors.append(f"invalid page.json: {exc}")
        return result("trace-bundle", path, errors)
    if not isinstance(manifest, dict):
        errors.append("page.json must be a JSON object")
        return result("trace-bundle", path, errors)

    schema = manifest.get("schema_version")
    if schema not in SUPPORTED_SCHEMAS:
        errors.append(f"unsupported schema_version: {schema!r}")
    security = as_dict(manifest, "security", errors, required=True)
    capture = as_dict(manifest, "capture", errors)
    source = as_dict(manifest, "source", errors)
    extraction = as_dict(manifest, "extraction", errors)
    if security.get("local_only") is not True:
        errors.append("local_only security marker is absent")
    if security.get("executable_html_included") is not False and "executable_html_included" in security:
        errors.append("bundle declares executable HTML")

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        errors.append("page.json: artifacts must be a list")
        artifacts = []
    listed: dict[str, dict] = {}
    for index, item in enumerate(artifacts):
        if not isinstance(item, dict):
            errors.append(f"page.json: artifacts[{index}] must be an object")
            continue
        name = item.get("name")
        problem = name_problem(name)
        if problem:
            errors.append(f"page.json: artifacts[{index}]: {problem}: {name!r}")
            continue
        if name == "page.json":
            errors.append("page.json must not register itself")
            continue
        if name in listed:
            errors.append(f"artifact registered twice: {name}")
            continue
        listed[name] = item
    for name in sorted(names - {"page.json"}):
        if name not in listed:
            errors.append(f"file not registered in page.json: {name}")
    for name, item in sorted(listed.items()):
        sha = item.get("sha256")
        size = item.get("bytes")
        if not isinstance(sha, str) or not SHA256.match(sha):
            errors.append(f"page.json: sha256 for {name} must be 64 lowercase hex characters")
        if isinstance(size, bool) or not isinstance(size, int) or not 0 <= size <= MAX_MEMBER_BYTES:
            errors.append(f"page.json: bytes for {name} must be a whole number from 0 to {MAX_MEMBER_BYTES}")
        if name not in bundle.members:
            errors.append(f"registered artifact missing: {name}")
            continue
        data = bundle.members[name]
        if sha != hashlib.sha256(data).hexdigest():
            errors.append(f"hash mismatch: {name}")
        if size != len(data):
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
    segments = capture.get("segment_count")
    page_segments = [name for name in pngs if name == "page.png" or re.fullmatch(r"page-\d{3}\.png", name)]
    if segments is not None and (isinstance(segments, bool) or not isinstance(segments, int)):
        errors.append("page.json: capture.segment_count must be a whole number")
    elif isinstance(segments, int) and segments != len(page_segments):
        errors.append(f"segment_count {segments} does not match {len(page_segments)} screenshot segment(s)")
    if "page.png" in names and len(page_segments) > 1:
        errors.append("page.png and numbered segments must not both be present")
    info = {
        "schema_version": schema if isinstance(schema, str) else None,
        "generator": manifest.get("generator") if isinstance(manifest.get("generator"), (dict, str)) else None,
        "captured_at": manifest.get("captured_at") if isinstance(manifest.get("captured_at"), str) else None,
        "source_url": source.get("url") if isinstance(source.get("url"), str) else None,
        "artifacts": sorted(listed),
        "dom_snapshot_truncated": capture.get("dom_snapshot_truncated"),
        "reader_sparse": extraction.get("reader_sparse"),
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
    except Exception as exc:  # noqa: BLE001 - one bad input must not stop a multi-file run
        return result("unknown", path, [f"verifier could not process this input: {type(exc).__name__}: {exc}"])


# --- self-test -----------------------------------------------------------------


def _bundle_bytes(files: dict[str, bytes], manifest: dict) -> dict[str, bytes]:
    return {**files, "page.json": json.dumps(manifest).encode()}


def _write_zip(path: pathlib.Path, members: dict[str, bytes], modes: dict[str, int] | None = None) -> pathlib.Path:
    with zipfile.ZipFile(path, "w") as archive:
        for name, data in members.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 19, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (modes or {}).get(name, 0o100644) << 16
            archive.writestr(info, data)
    return path


def _register(files: dict[str, bytes]) -> list[dict]:
    return [{"name": n, "bytes": len(d), "sha256": hashlib.sha256(d).hexdigest()} for n, d in files.items()]


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

    # Executable or unexpected artifacts are rejected even when correctly registered.
    script = {**files, "helper.sh": b"#!/bin/sh\necho hi\n"}
    script_manifest = {**manifest, "artifacts": _register(script)}
    expect("registered helper.sh", _write_zip(temp / "script.zip", _bundle_bytes(script, script_manifest), {"helper.sh": 0o100755}), False, "file type not allowed")
    expect("registered helper.sh mode", _write_zip(temp / "script2.zip", _bundle_bytes(script, script_manifest), {"helper.sh": 0o100755}), False, "executable")
    for extra_name in ("notes.txt", "page.exe", "page.pdf", "page-1.png", "page.md.sh"):
        other = {**files, extra_name: PNG_SIGNATURE if extra_name.endswith(".png") else b"x"}
        expect(f"registered {extra_name}", _write_zip(temp / "other.zip", _bundle_bytes(other, {**manifest, "artifacts": _register(other)})), False, "not allowed")
    expect("executable page.md in ZIP", _write_zip(temp / "exec.zip", _bundle_bytes(files, manifest), {"page.md": 0o100755}), False, "executable")
    expect("setuid page.png in ZIP", _write_zip(temp / "suid.zip", _bundle_bytes(files, manifest), {"page.png": 0o104644}), False, "setuid")
    expect("symlink in ZIP", _write_zip(temp / "link.zip", _bundle_bytes(files, manifest), {"page.png": 0o120777}), False, "symbolic link")
    expect("fifo in ZIP", _write_zip(temp / "fifo.zip", _bundle_bytes(files, manifest), {"page.png": 0o010644}), False, "special file")
    exec_folder = temp / "exec-folder"
    exec_folder.mkdir()
    for name, data in _bundle_bytes(files, manifest).items():
        (exec_folder / name).write_bytes(data)
    (exec_folder / "page.md").chmod(0o755)
    expect("executable file in folder", exec_folder, False, "executable")
    link_folder = temp / "link-folder"
    link_folder.mkdir()
    for name, data in _bundle_bytes(files, manifest).items():
        (link_folder / name).write_bytes(data)
    (link_folder / "page-viewport.png").symlink_to(link_folder / "page.png")
    expect("symlink in folder", link_folder, False, "symbolic link")
    nested_folder = temp / "nested-folder"
    nested_folder.mkdir()
    for name, data in _bundle_bytes(files, manifest).items():
        (nested_folder / name).write_bytes(data)
    (nested_folder / "sub").mkdir()
    expect("subdirectory in folder", nested_folder, False, "unexpected directory")
    hidden_folder = temp / "hidden-folder"
    hidden_folder.mkdir()
    for name, data in _bundle_bytes(files, manifest).items():
        (hidden_folder / name).write_bytes(data)
    (hidden_folder / ".helper.sh").write_bytes(b"x")
    expect("dotfile in folder", hidden_folder, False, "not allowed")

    # Malformed page.json shapes give structured errors, never a crash.
    good = _register(files)
    malformed = {
        "top-level list": [],
        "top-level string": "page",
        "artifacts object": {**manifest, "artifacts": {"page.md": {}}},
        "artifact not object": {**manifest, "artifacts": [*good, "page.md"]},
        "security string": {**manifest, "security": "local"},
        "capture list": {**manifest, "capture": [1]},
        "source number": {**manifest, "source": 5},
        "sha int": {**manifest, "artifacts": [{**good[0], "sha256": 12}, *good[1:]]},
        "sha uppercase": {**manifest, "artifacts": [{**good[0], "sha256": good[0]["sha256"].upper()}, *good[1:]]},
        "bytes negative": {**manifest, "artifacts": [{**good[0], "bytes": -1}, *good[1:]]},
        "bytes huge": {**manifest, "artifacts": [{**good[0], "bytes": 10**20}, *good[1:]]},
        "bytes bool": {**manifest, "artifacts": [{**good[0], "bytes": True}, *good[1:]]},
        "bytes string": {**manifest, "artifacts": [{**good[0], "bytes": "13"}, *good[1:]]},
        "name traversal": {**manifest, "artifacts": [*good, {**good[0], "name": "../x"}]},
        "name absolute": {**manifest, "artifacts": [*good, {**good[0], "name": "/etc/passwd"}]},
        "name none": {**manifest, "artifacts": [*good, {**good[0], "name": None}]},
        "name list": {**manifest, "artifacts": [*good, {**good[0], "name": ["page.md"]}]},
        "duplicate name": {**manifest, "artifacts": [*good, good[0]]},
        "self registration": {**manifest, "artifacts": [*good, {"name": "page.json", "bytes": 1, "sha256": "0" * 64}]},
        "segment string": {**manifest, "capture": {"segment_count": "1"}},
        "missing artifacts": {k: v for k, v in manifest.items() if k != "artifacts"},
        "missing security": {k: v for k, v in manifest.items() if k != "security"},
    }
    malformed_paths = []
    for label, shape in malformed.items():
        bad = temp / f"malformed-{len(malformed_paths)}.zip"
        _write_zip(bad, {**files, "page.json": json.dumps(shape).encode()})
        malformed_paths.append(bad)
        try:
            outcome = verify(bad)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"malformed {label}: raised {exc!r}")
            continue
        if outcome["ok"] or not outcome["errors"] or outcome["kind"] != "trace-bundle":
            failures.append(f"malformed {label}: got {outcome}")
    not_json = temp / "not-json.zip"
    _write_zip(not_json, {**files, "page.json": b"\xff{"})
    expect("page.json not UTF-8 JSON", not_json, False, "invalid page.json")
    # A multi-file --json run reports every input even when some are malformed.
    run = subprocess.run(
        [sys.executable, str(pathlib.Path(__file__).resolve()), "--json", *map(str, malformed_paths[:3]), str(temp / "valid.zip")],
        capture_output=True,
        text=True,
    )
    try:
        reports = json.loads(run.stdout)
        if run.returncode != 1 or [r["ok"] for r in reports] != [False, False, False, True]:
            failures.append(f"multi-file --json run: exit {run.returncode}, {reports}")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"multi-file --json run did not print JSON: {exc}; stderr={run.stderr[-300:]}")

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
