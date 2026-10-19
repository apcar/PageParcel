#!/usr/bin/env python3
"""Find the newest PageParcel output: Trace Bundle ZIPs, Page Text .md files, or extracted bundle folders.

Searches ~/Downloads and ~/Desktop by default (Chrome's usual download targets).

Examples:
  find_latest_bundle.py                      # newest output of any kind
  find_latest_bundle.py --kind text          # newest Page Text .md
  find_latest_bundle.py --since 120 --json   # newest output written in the last 2 minutes, as JSON
  find_latest_bundle.py --dir ~/Captures --all
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

KINDS = {
    "bundle": lambda p: p.is_file() and p.suffix.lower() == ".zip",
    "text": lambda p: p.is_file() and p.suffix.lower() == ".md",
    "folder": lambda p: p.is_dir() and (p / "page.json").is_file(),
}


def kind_of(path: pathlib.Path) -> str | None:
    for name, test in KINDS.items():
        if test(path):
            return name
    return None


def candidates(directories: list[pathlib.Path], kind: str) -> list[dict]:
    found = []
    for directory in directories:
        if not directory.is_dir():
            continue
        for path in directory.glob("PageParcel-*"):
            detected = kind_of(path)
            if detected is None or (kind != "any" and detected != kind):
                continue
            found.append({"path": str(path), "kind": detected, "modified": path.stat().st_mtime})
    return sorted(found, key=lambda item: item["modified"], reverse=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Find the newest PageParcel output.")
    parser.add_argument("--dir", action="append", type=pathlib.Path, help="directory to search (repeatable); default ~/Downloads and ~/Desktop")
    parser.add_argument("--kind", choices=["any", "bundle", "text", "folder"], default="any")
    parser.add_argument("--since", type=float, metavar="SECONDS", help="only outputs modified within this many seconds")
    parser.add_argument("--all", action="store_true", help="list every match, newest first")
    parser.add_argument("--json", action="store_true", help="print JSON")
    args = parser.parse_args()

    home = pathlib.Path.home()
    directories = [d.expanduser() for d in args.dir] if args.dir else [home / "Downloads", home / "Desktop"]
    found = candidates(directories, args.kind)
    if args.since is not None:
        cutoff = time.time() - args.since
        found = [item for item in found if item["modified"] >= cutoff]
    if not found:
        message = f"No PageParcel output ({args.kind}) found in: {', '.join(str(d) for d in directories)}"
        print(json.dumps({"found": False, "message": message}) if args.json else message)
        return 1
    selected = found if args.all else found[:1]
    for item in selected:
        item["modified_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(item["modified"]))
    if args.json:
        print(json.dumps({"found": True, "results": selected} if args.all else {"found": True, **selected[0]}, indent=2))
    else:
        for item in selected:
            print(item["path"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
