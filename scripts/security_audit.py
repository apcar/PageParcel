#!/usr/bin/env python3
import json
import pathlib
import re
import sys

REQUIRED_PERMISSIONS = {"activeTab", "scripting", "storage", "unlimitedStorage", "downloads"}
BANNED_SOURCE = {
    "chrome.storage.sync": r"chrome\.storage\.sync",
    "fetch": r"\bfetch\s*\(",
    "XMLHttpRequest": r"\bXMLHttpRequest\b",
    "WebSocket": r"\bWebSocket\b",
    "sendBeacon": r"\bsendBeacon\b",
    "Defuddle async extraction": r"\b(parseAsync|fetchAsyncVariables)\s*\(",
}


def main() -> int:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).parents[1] / "assets/extension").resolve()
    errors: list[str] = []
    manifest = json.loads((root / "manifest.json").read_text())
    if manifest.get("manifest_version") != 3:
        errors.append("manifest_version must be 3")
    permissions = set(manifest.get("permissions", []))
    if permissions != REQUIRED_PERMISSIONS:
        errors.append(f"permissions differ: {sorted(permissions)}")
    if manifest.get("host_permissions") != []:
        errors.append("host_permissions must be empty")
    csp = manifest.get("content_security_policy", {}).get("extension_pages", "")
    for required in ("script-src 'self'", "connect-src 'self'", "object-src 'none'", "frame-src 'none'"):
        if required not in csp:
            errors.append(f"CSP missing {required}")
    if "'unsafe-eval'" in csp or "'unsafe-inline'" in csp:
        errors.append("CSP contains an unsafe script allowance")

    # Explicit local-OCR CSP: only packaged WASM is newly permitted; no general eval/CDN.
    expected_csp = "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; object-src 'none'; connect-src 'self'; img-src 'self' data: blob:; media-src 'none'; frame-src 'none';"
    if csp != expected_csp:
        errors.append("CSP differs from reviewed local-OCR policy")
    import hashlib
    ocr_root = root / "public/ocr"
    asset_manifest = ocr_root / "assets.json"
    if not asset_manifest.exists():
        errors.append("Bundled OCR assets missing: run npm run ocr:bundle")
    else:
        hashes = json.loads(asset_manifest.read_text())
        expected = {"worker.min.js", "LICENSE-tesseract.txt", "LICENSE-core.txt", "eng.traineddata.gz", "tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"}
        if set(hashes) != expected:
            errors.append("Unexpected OCR asset set")
        for name, digest in hashes.items():
            if name not in expected:
                continue
            asset = ocr_root / name
            if not asset.exists() or hashlib.sha256(asset.read_bytes()).hexdigest() != digest:
                errors.append(f"OCR asset hash mismatch: {name}")
        lock = json.loads((root / "package-lock.json").read_text())["packages"]
        for package, version in (("tesseract.js", "7.0.0"), ("@tesseract.js-data/eng", "1.0.0")):
            if lock.get(f"node_modules/{package}", {}).get("version") != version:
                errors.append(f"Unreviewed OCR dependency version: {package}")

    source_root = root / "src"
    for path in source_root.rglob("*"):
        if path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
            continue
        text = path.read_text(errors="replace")
        for label, pattern in BANNED_SOURCE.items():
            if re.search(pattern, text):
                errors.append(f"{path.relative_to(root)} uses banned {label}")

    build_module = (root / "src/pack/build.ts").read_text()
    if "useAsync: false" not in build_module or ").parse()" not in build_module:
        errors.append("Defuddle must be configured for synchronous local parsing")

    if errors:
        print("SECURITY AUDIT FAILED")
        for error in errors:
            print(f"- {error}")
        return 1
    print("SECURITY AUDIT PASSED")
    print(f"- permissions: {', '.join(sorted(REQUIRED_PERMISSIONS))}")
    print("- host permissions: none")
    print("- first-party network APIs: none")
    print("- Defuddle: synchronous local parse")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
