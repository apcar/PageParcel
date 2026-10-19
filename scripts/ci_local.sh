#!/usr/bin/env bash
# Run the same gates as .github/workflows/ci.yml, in the same order, locally.
# Usage: bash scripts/ci_local.sh            (uses existing node_modules)
#        PAGEPARCEL_CLEAN_INSTALL=1 bash scripts/ci_local.sh   (npm ci first)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ext="$root/assets/extension"

step() { printf '\n==> %s\n' "$*"; }

cd "$ext"
if [[ "${PAGEPARCEL_CLEAN_INSTALL:-0}" == "1" || ! -d node_modules ]]; then
  step "npm ci"
  npm ci --ignore-scripts
fi
step "format check";      npm run format:check
step "lint";              npm run lint
step "typecheck";         npm run typecheck
step "unit tests";        npm test
step "build";             npm run build

cd "$root"
step "security audit";    python3 scripts/security_audit.py assets/extension
step "verifier self-test"; python3 scripts/verify_bundle.py --self-test
step "public sample";     python3 scripts/build_public_sample.py
python3 scripts/verify_bundle.py docs/examples/PageParcel-Sample.zip
git diff --exit-code -- docs/examples/PageParcel-Sample.zip
step "committed extension-dist matches fresh build"
diff -r assets/extension/dist assets/extension-dist
echo
echo "ALL CI GATES PASSED"
