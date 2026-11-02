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


# Manifest keys that would widen what pages, other extensions, or updates can reach.
FORBIDDEN_MANIFEST_KEYS = (
    "optional_permissions",
    "optional_host_permissions",
    "externally_connectable",
    "content_scripts",
    "web_accessible_resources",
    "update_url",
    "key",
)
# Reviewed CSP: no eval of any kind (including WASM), no CDN.
# default-src 'self' closes the directives that were previously unlisted (fonts, styles, manifests).
EXPECTED_CSP = (
    "default-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; "
    "connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; "
    "media-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';"
)


def audit_manifest(manifest: dict) -> list[str]:
    errors: list[str] = []
    if manifest.get("manifest_version") != 3:
        errors.append("manifest_version must be 3")
    permissions = set(manifest.get("permissions", []))
    if permissions != REQUIRED_PERMISSIONS:
        errors.append(f"permissions differ: {sorted(permissions)}")
    if manifest.get("host_permissions") != []:
        errors.append("host_permissions must be empty")
    for key in FORBIDDEN_MANIFEST_KEYS:
        if key in manifest:
            errors.append(f"unexpected manifest key {key}")
    csp = manifest.get("content_security_policy", {}).get("extension_pages", "")
    script_src = re.search(r"script-src([^;]*)", csp)
    if not script_src or "'self'" not in script_src.group(1):
        errors.append("CSP missing script-src 'self'")
    elif re.search(r"'unsafe-eval'|'wasm-unsafe-eval'|'unsafe-inline'|https?:|\*", script_src.group(1)):
        errors.append("CSP contains an unsafe script allowance")
    if re.search(r"https?://", csp):
        errors.append("CSP allows a remote origin")
    if csp != EXPECTED_CSP:
        errors.append("CSP differs from reviewed policy")
    return errors


def main() -> int:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).parents[1] / "assets/extension").resolve()
    errors: list[str] = []
    for manifest_path in (root / "manifest.json", root / "dist/manifest.json", root.parent / "extension-dist/manifest.json"):
        if manifest_path.exists():
            label = manifest_path.relative_to(root.parent)
            errors.extend(f"{label}: {error}" for error in audit_manifest(json.loads(manifest_path.read_text())))
    if not (root.parent / "extension-dist/manifest.json").exists():
        errors.append("extension-dist/manifest.json missing")

    lock_packages = json.loads((root / "package-lock.json").read_text())["packages"]
    for name, entry in lock_packages.items():
        if not name or entry.get("link"):
            continue
        if not str(entry.get("resolved", "")).startswith("https://registry.npmjs.org/") or not entry.get("integrity"):
            errors.append(f"lockfile entry not pinned to the npm registry with integrity: {name}")

    ocr_assets = [p for p in (root / "public/ocr", root / "dist/ocr", root.parent / "extension-dist/ocr") if p.exists()]
    if ocr_assets:
        errors.append("OCR assets were removed in 0.3.0 and must not ship")
    for package in ("tesseract.js", "tesseract.js-core", "@tesseract.js-data/eng"):
        if f"node_modules/{package}" in lock_packages:
            errors.append(f"Removed OCR dependency present: {package}")

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
    print("- host permissions: none; no optional, external, content-script or web-accessible entries")
    print("- manifests checked: source, dist, extension-dist")
    print("- lockfile: every package from registry.npmjs.org with integrity")
    print("- first-party network APIs: none")
    print("- Defuddle: synchronous local parse")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
