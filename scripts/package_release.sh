#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
version="$(node -p "require('$root/assets/extension/package.json').version")"
out="$root/release"
archive="$out/PageParcel-$version.zip"

if [[ -n "${GITHUB_REF_NAME:-}" && "${GITHUB_REF_NAME#v}" != "$version" ]]; then
  echo "Release tag $GITHUB_REF_NAME does not match package version $version" >&2
  exit 1
fi

mkdir -p "$out"
rm -f "$archive" "$archive.sha256"

(
  cd "$root/assets/extension-dist"
  # Package exactly the committed files. Ignored local clutter such as
  # Finder's .DS_Store is invisible to git status but would otherwise be zipped.
  # -X drops uid/gid and other extra attributes; -D omits directory entries.
  git ls-files -z -- . | xargs -0 zip -qX -D "$archive"
)

# Fail if the archive is not exactly the tracked file list.
diff <(git -C "$root" ls-files -- assets/extension-dist | sed 's#^assets/extension-dist/##' | LC_ALL=C sort) \
  <(unzip -Z1 "$archive" | LC_ALL=C sort) >/dev/null || {
  echo "Archive contents differ from the tracked assets/extension-dist files" >&2
  exit 1
}

(
  cd "$out"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256"
  else
    shasum -a 256 "$(basename "$archive")" > "$(basename "$archive").sha256"
  fi
)

echo "Packaged $archive"
