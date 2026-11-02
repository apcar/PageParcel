#!/usr/bin/env bash
set -euo pipefail

skill_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
extension_root="$skill_root/assets/extension"
dist_root="$skill_root/assets/extension-dist"

cd "$extension_root"
npm ci --ignore-scripts
npm test
npm run build
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$extension_root/dist/" "$dist_root/"
else
  rm -rf "$dist_root"
  cp -R "$extension_root/dist" "$dist_root"
fi
# Audit after syncing so the source, dist and committed extension-dist manifests are all checked.
python3 "$skill_root/scripts/security_audit.py" "$extension_root"
echo "Built unpacked extension: $dist_root"
