#!/usr/bin/env bash
# Runs every gate of .github/workflows/test-web.yaml locally, in CI order:
# type-check, Biome lint and format check, unit tests, Playwright tests.
# Then runs the whitespace checks of .github/workflows/lint-files.yaml (tabs,
# trailing whitespace, final newline) on tracked and untracked text files.
#
# Every gate runs even if an earlier one fails, so one run reports all
# failures. Exit status is non-zero if any gate failed.
#
# Usage: .claude/skills/editor-update/scripts/verify.sh [--fix]
#   --fix   run `biome check --write` before the checks

set -uo pipefail

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$root" || exit 1

failed=()

# Mirrors lint-files.yaml: `git grep -I` skips binary and `-diff` files, as in
# CI. Untracked files are checked too, so new files are not missed.
lint_files() {
  local status=0 f
  while IFS= read -r f; do
    [[ -f "$f" ]] || continue
    grep -nHP '\t' "$f" && status=1
    grep -nHP '\s+$' "$f" && status=1
    if [[ -s "$f" && -n "$(tail -c 1 "$f")" ]]; then
      echo "$f: no final newline"
      status=1
    fi
  done < <(
    git grep -Il ''
    git ls-files --others --exclude-standard -z | xargs -r0 grep -Il -d skip ''
  )
  return "$status"
}

gate() {
  local name=$1
  shift
  echo
  echo "=== $name ==="
  if "$@"; then
    echo "--- $name: PASS"
  else
    echo "--- $name: FAIL"
    failed+=("$name")
  fi
}

if [[ "${1:-}" == "--fix" ]]; then
  (cd web && npx biome check --write .)
fi

if [[ ! -d web/node_modules/@playwright ]]; then
  echo "Installing the web/ dependencies (first run only)…"
  (cd web && npm ci) || failed+=("npm ci")
  (cd web && npx playwright install chromium) || failed+=("Chromium install")
fi

gate "Type-check" npm --prefix web run typecheck
gate "Lint and format" npm --prefix web run lint
gate "Unit tests" npm --prefix web run test:unit
gate "Integration tests" npm --prefix web run test:e2e
gate "Repository lint" lint_files

echo
if ((${#failed[@]})); then
  echo "FAILED: ${failed[*]}"
  exit 1
fi
echo "ALL GATES PASSED"
