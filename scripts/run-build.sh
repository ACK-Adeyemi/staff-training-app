#!/usr/bin/env bash
# Unattended build loop for the Staff Training App PoC.
# Run ON THE VM as the `agent` user (not inside the container), from the repo:
#
#   tmux new -s build scripts/run-build.sh
#
# Detach: Ctrl+B then D.   Reattach: tmux attach -t build.   Stop now: Ctrl+C in tmux, or tmux kill-session -t build.
# Pause cleanly: touch .agent-logs/build/PAUSE. The current session finishes, then the loop waits
# until you delete the file (rm .agent-logs/build/PAUSE). Use this before changing anything in the repo.
# Progress: docs/progress.md.   Loop log: .agent-logs/build/loop.log.   Session logs: .agent-logs/build/.
#
# Each session is a fresh headless Claude Code run inside this app's dev container, in auto mode,
# fed scripts/BUILD_PROMPT.md. It stops when docs/progress.md says BUILD COMPLETE or BLOCKED.
# A failed session (usually a usage limit) waits and retries; waits don't count as sessions.
set -u

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)" || exit 1
cd "$ROOT" || exit 1
APP="$(basename "$ROOT")"
PROJECT="$(printf '%s' "$APP" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g')"
export AGENT_TOKEN_FILE="${AGENT_TOKEN_FILE:-$HOME/.config/agent-vm/claude-oauth-token}"
export DOCKER_HOST="${DOCKER_HOST:-unix:///run/user/$(id -u)/docker.sock}"
COMPOSE=(docker compose -p "$PROJECT" -f "$ROOT/.devcontainer/compose.yaml")

BRANCH="agent/poc-build"
PROMPT_FILE="scripts/BUILD_PROMPT.md"
LOG_DIR=".agent-logs/build"
MODEL="${MODEL:-sonnet}"                 # coordinator; subagents use the models in .claude/agents
MAX_SESSIONS="${MAX_SESSIONS:-250}"      # sessions that ran to completion
MAX_FAILURES="${MAX_FAILURES:-200}"      # failed attempts in total (usage limits, network) before giving up
WAIT_ON_ERROR="${WAIT_ON_ERROR:-1800}"   # seconds between retries after a failure
WAIT_LONG="${WAIT_LONG:-7200}"           # after 6 failures in a row (e.g. a weekly limit), retry every 2 hours

PAUSE_FILE="$LOG_DIR/PAUSE"

mkdir -p "$LOG_DIR"
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG_DIR/loop.log"; }
status() { grep -m1 '^Status:' docs/progress.md 2>/dev/null | awk '{print $2, $3}'; }

[ -s "$AGENT_TOKEN_FILE" ] || { log "No Claude token. Run: scripts/agent token"; exit 1; }
[ -f "$PROMPT_FILE" ] || { log "Missing $PROMPT_FILE"; exit 1; }
[ -f docs/brief.md ] && [ -f docs/build-pack.md ] || { log "Missing docs/brief.md or docs/build-pack.md"; exit 1; }
[ -f .protected-names ] || { log "Missing .protected-names (canary names for the M0 hook). See setup steps."; exit 1; }
[ -f scripts/split-docs.py ] || { log "Missing scripts/split-docs.py"; exit 1; }

# Regenerate the per-section copies of the brief and build pack (docs/brief/, docs/build-pack/).
# They're git-ignored, so this also recreates them after a fresh clone or a change to the originals.
split_docs() { "${COMPOSE[@]}" exec -T dev python3 scripts/split-docs.py >> "$LOG_DIR/loop.log" 2>&1; }

# Get onto the build branch.
current="$(git branch --show-current)"
if [ "$current" != "$BRANCH" ]; then
  [ -z "$(git status --porcelain)" ] || { log "Uncommitted changes on $current. Commit or discard them first."; exit 1; }
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then git switch -q "$BRANCH"; else git switch -q -c "$BRANCH"; fi
fi

"${COMPOSE[@]}" up -d --build --wait >/dev/null || { log "Containers failed to start. Run: scripts/agent doctor"; exit 1; }
split_docs || { log "scripts/split-docs.py failed. See $LOG_DIR/loop.log"; exit 1; }

sessions=0
failures=0
streak=0
log "Build loop started on $BRANCH (model $MODEL). Status: $(status)"

while :; do
  case "$(status)" in
    "BUILD COMPLETE"*) log "Build complete. See docs/build-report.md"; exit 0 ;;
    "BLOCKED"*)        log "Blocked. See docs/progress.md, fix it, then run this script again."; exit 2 ;;
  esac
  [ "$sessions" -lt "$MAX_SESSIONS" ] || { log "Reached MAX_SESSIONS=$MAX_SESSIONS. See docs/progress.md"; exit 3; }
  [ "$failures" -lt "$MAX_FAILURES" ] || { log "Reached MAX_FAILURES=$MAX_FAILURES. See $LOG_DIR"; exit 4; }

  if [ -f "$PAUSE_FILE" ]; then
    log "Paused (delete $PAUSE_FILE to resume)."
    while [ -f "$PAUSE_FILE" ]; do sleep 30; done
    log "Resumed."
    continue
  fi

  # Containers can stop if the VM rebooted; bring them back.
  if [ -z "$("${COMPOSE[@]}" ps -q --status running dev 2>/dev/null)" ]; then
    "${COMPOSE[@]}" up -d --wait >/dev/null || { failures=$((failures + 1)); log "Containers not up; waiting."; sleep "$WAIT_ON_ERROR"; continue; }
  fi
  split_docs || log "Warning: scripts/split-docs.py failed; using the existing section files."

  ts="$(date +%Y%m%d-%H%M%S)"
  log "Session $((sessions + 1)) starting (log: $LOG_DIR/session-$ts.jsonl)"
  "${COMPOSE[@]}" exec -T -e AGENT_TASK=1 -e CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 dev \
    claude-agent -p "$(cat "$PROMPT_FILE")" \
      --permission-mode auto --model "$MODEL" \
      --output-format stream-json --verbose \
    < /dev/null > "$LOG_DIR/session-$ts.jsonl" 2> "$LOG_DIR/session-$ts.err"
  code=$?

  if [ "$code" -eq 0 ]; then
    sessions=$((sessions + 1)); streak=0
    log "Session $sessions finished. $(status). Next: $(grep -m1 '^Next step:' docs/progress.md 2>/dev/null | cut -c12-)"
  else
    failures=$((failures + 1)); streak=$((streak + 1))
    wait="$WAIT_ON_ERROR"; [ "$streak" -ge 6 ] && wait="$WAIT_LONG"
    log "Session failed (exit $code, $streak in a row). Last error: $(tail -n 1 "$LOG_DIR/session-$ts.err" 2>/dev/null | cut -c1-200). Retrying in $((wait / 60)) min."
    sleep "$wait"
  fi
done
