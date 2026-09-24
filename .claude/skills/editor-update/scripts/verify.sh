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
  (cd web && npx -y @biomejs/biome@2.5.14 check --write .)
fi

gate "Type-check" npx -y -p typescript@5.9.2 tsc --noEmit --project web/jsconfig.json
gate "Lint and format" bash -c 'cd web && npx -y @biomejs/biome@2.5.14 check .'
gate "Unit tests" node --test "web/tests/unit/**/*.test.mjs"

if [[ ! -d web/tests/node_modules/@playwright ]]; then
  echo "Installing Playwright into web/tests (first run only)…"
  npm ci --prefix web/tests >/dev/null || failed+=("Playwright install")
  (cd web/tests && npx playwright install chromium) || failed+=("Chromium install")
fi
gate "Integration tests" bash -c 'cd web/tests && npx playwright test'
gate "Repository lint" lint_files

echo
if ((${#failed[@]})); then
  echo "FAILED: ${failed[*]}"
  exit 1
fi
echo "ALL GATES PASSED"
