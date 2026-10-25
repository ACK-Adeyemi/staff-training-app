#!/usr/bin/env bash
# PreToolUse guard for Edit / Write / NotebookEdit.
# Stops agents changing their own guardrails, writing secrets files, or editing outside the project.
# This is a guardrail, not a security boundary: the VM, container and proxy are the boundary,
# and the human reviews every branch before it reaches GitHub.
set -euo pipefail

input="$(cat)"
path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")"
[ -n "$path" ] || exit 0

root="$(realpath -m -- "${CLAUDE_PROJECT_DIR:-$PWD}")"
case "$path" in
  /*) abs="$(realpath -m -- "$path")" ;;
  *)  abs="$(realpath -m -- "$root/$path")" ;;
esac

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

if [ "$abs" != "$root" ] && [ "${abs#"$root"/}" = "$abs" ]; then
  # Outside the project: only scratch files under /tmp are fine.
  case "$abs" in /tmp/*) exit 0 ;; esac
  deny "Only files inside the project ($root) may be edited."
fi

rel="${abs#"$root"/}"
case "$rel" in
  .git|.git/*)
    deny "Don't edit .git directly; use git commands." ;;
  .claude/agent-memory/*|.claude/agent-memory-local/*|.claude/rules/*)
    exit 0 ;;
  .github/*)
    # This app's build plan has the agents write CI and the Pages deploy workflow.
    # The human reviews every .github change when shipping (ship flags these files).
    exit 0 ;;
  .devcontainer/*|.claude/*|scripts/agent|scripts/run-build.sh|scripts/BUILD_PROMPT.md|scripts/split-docs.py)
    deny "$rel is protected (container, agent configuration or build loop). Don't change it. Describe the change you need in docs/questions-for-user.md." ;;
  docs/brief.md|docs/build-pack.md)
    deny "$rel is a source document owned by the user. Don't edit it; log conflicts or gaps in docs/decisions.md." ;;
  docs/brief/*|docs/build-pack/*)
    deny "$rel is generated from docs/brief.md or docs/build-pack.md by scripts/split-docs.py. Don't edit it; log conflicts or gaps in docs/decisions.md." ;;
  .protected-names)
    deny "Don't edit, print or commit .protected-names." ;;
  .env.example)
    exit 0 ;;
  .env|.env.*|*/.env|*/.env.*)
    deny "Don't create real env files. Document variables in .env.example with placeholder values; the container provides real ones." ;;
esac

exit 0
