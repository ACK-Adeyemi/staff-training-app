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

# Scratch files are fine.
case "$abs" in /tmp/*) exit 0 ;; esac

if [ "$abs" != "$root" ] && [ "${abs#"$root"/}" = "$abs" ]; then
  deny "Only files inside the project ($root) may be edited."
fi

rel="${abs#"$root"/}"
case "$rel" in
  .git|.git/*)
    deny "Don't edit .git directly; use git commands." ;;
  .claude/agent-memory/*|.claude/agent-memory-local/*)
    exit 0 ;;
  .github/*|.devcontainer/*|.claude/*|scripts/agent)
    deny "$rel is protected (CI, container or agent configuration). Don't change it. Describe the change you need under 'Needs a human' in your final report." ;;
  .env.example)
    exit 0 ;;
  .env|.env.*|*/.env|*/.env.*)
    deny "Don't create real env files. Document variables in .env.example with placeholder values; the container provides real ones." ;;
esac

exit 0
