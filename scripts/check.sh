#!/usr/bin/env bash
# One entry point for every quality gate. Agents run it before finishing; CI runs it on every PR.
# Add to it when the stack grows (e.g. e2e tests), and keep it fast enough to run often.
#
#   scripts/check.sh            run lint, type checks, tests and dependency audits that apply
#   scripts/check.sh --install  install dependencies first (used by CI)
#
# Output is kept short on purpose: each step's full output goes to .agent-logs/check/<step>.log,
# and only failures print their last lines here. Open the log when you need more detail.
# In CI (CI=true) the full output is printed, because CI logs are read by humans.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

install=0
[ "${1:-}" = "--install" ] && install=1
failed=0
ran=0
LOG_DIR=".agent-logs/check"
TAIL_LINES="${CHECK_TAIL_LINES:-60}"
mkdir -p "$LOG_DIR"

step() {
  local name="$1"; shift
  local log
  log="$LOG_DIR/$(printf '%s' "$name" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-60).log"
  ran=$((ran + 1))
  if [ "${CI:-}" = "true" ]; then
    echo "==> $name"
    if "$@"; then echo "    ok"; else echo "    FAILED: $name"; failed=1; fi
    return
  fi
  local start=$SECONDS
  if "$@" > "$log" 2>&1; then
    echo "ok      $name ($((SECONDS - start))s)"
  else
    echo "FAILED  $name ($((SECONDS - start))s). Last $TAIL_LINES lines (full output: $log):"
    tail -n "$TAIL_LINES" "$log" | sed 's/^/    /'
    failed=1
  fi
}

has_npm_script() { jq -e --arg s "$1" '.scripts[$s] // empty' package.json >/dev/null 2>&1; }

# ---- Node / TypeScript (pnpm or npm) ----
if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ] || jq -e '(.packageManager // "") | startswith("pnpm")' package.json >/dev/null 2>&1; then
    PM=pnpm
  else
    PM=npm
  fi
  if [ "$install" = 1 ] || [ ! -d node_modules ]; then
    if [ "$PM" = pnpm ]; then
      if [ -f pnpm-lock.yaml ]; then step "pnpm install --frozen-lockfile" pnpm install --frozen-lockfile
      else step "pnpm install" pnpm install; fi
    elif [ -f package-lock.json ]; then step "npm ci" npm ci
    else step "npm install" npm install; fi
  fi
  if [ "$install" = 1 ]; then step "playwright install chromium" pnpm exec playwright install chromium; fi
  # Order matters: e2e usually runs against the production build.
  for s in lint typecheck test build e2e; do
    if has_npm_script "$s"; then step "$PM run $s" "$PM" run "$s"; fi
  done
  step "$PM audit (high and critical)" "$PM" audit --audit-level high
fi

# ---- Python ----
if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  if [ "$install" = 1 ] && [ ! -x .venv/bin/python ]; then step "create .venv" python3 -m venv .venv; fi
  PY=python3
  [ -x .venv/bin/python ] && PY=.venv/bin/python
  if [ "$install" = 1 ]; then
    for f in requirements.txt requirements-dev.txt; do
      if [ -f "$f" ]; then step "pip install -r $f" "$PY" -m pip install -q -r "$f"; fi
    done
    if [ -f pyproject.toml ]; then
      step "pip install project" sh -c "'$PY' -m pip install -q -e '.[dev]' 2>/dev/null || '$PY' -m pip install -q -e ."
    fi
    step "install pip-audit" "$PY" -m pip install -q pip-audit
  fi
  if "$PY" -m ruff --version >/dev/null 2>&1; then step "ruff" "$PY" -m ruff check .; fi
  if "$PY" -m mypy --version >/dev/null 2>&1 && { [ -f mypy.ini ] || grep -qs '^\[tool.mypy\]' pyproject.toml; }; then
    step "mypy" "$PY" -m mypy .
  fi
  if "$PY" -m pytest --version >/dev/null 2>&1; then step "pytest" "$PY" -m pytest -q; fi
  if "$PY" -m pip_audit --version >/dev/null 2>&1; then
    step "pip-audit" "$PY" -m pip_audit
  elif command -v pip-audit >/dev/null 2>&1 && [ -f requirements.txt ]; then
    step "pip-audit" pip-audit -r requirements.txt
  fi
fi

if [ "$ran" -eq 0 ]; then
  echo "No checks configured yet (no package.json, pyproject.toml or requirements.txt)."
  echo "That's expected for a fresh template; add them when the stack is chosen."
fi

if [ "$failed" -ne 0 ]; then echo "CHECKS FAILED"; exit 1; fi
echo "All checks passed."
