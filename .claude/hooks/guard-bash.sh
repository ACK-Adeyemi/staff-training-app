#!/usr/bin/env bash
# PreToolUse guard for Bash. Blocks commands that would bypass the human review step
# or the network rules. A guardrail, not a security boundary (see guard-paths.sh).
set -euo pipefail

input="$(cat)"
cmd="$(jq -r '.tool_input.command // empty' <<<"$input")"
[ -n "$cmd" ] || exit 0

# One line, with a leading space so patterns can anchor on "start of word".
c=" $(tr '\n\t' '  ' <<<"$cmd") "

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

has() { grep -Eq -- "$1" <<<"$c"; }

# "git" possibly followed by global options like -C <dir> or -c key=val, then the subcommand.
GIT='(^|[[:space:];&|(`])git([[:space:]]+-[cC][[:space:]]+[^[:space:]]+)*[[:space:]]+'

has "${GIT}push([[:space:]]|$)" &&
  deny "Agents never push. Commit on your feature branch; the human reviews and ships it."

has "${GIT}remote[[:space:]]+(add|set-url|remove|rm|rename)([[:space:]]|$)" &&
  deny "Don't change git remotes."

if has "${GIT}config([[:space:]]|$)" && ! has "${GIT}config[[:space:]]+(--get|--get-all|--list|-l)([[:space:]]|$)"; then
  deny "Don't change git configuration."
fi

has '(^|[[:space:];&|(`])gh([[:space:]]|$)' &&
  deny "The GitHub CLI isn't available to agents. The human opens pull requests."

has '(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z|da)?sh([[:space:]]|$)' &&
  deny "Don't pipe downloads into a shell. Add dependencies through the package manager and lockfile."

has '(dangerously-skip-permissions|bypassPermissions)' &&
  deny "Don't start agents that skip permission checks."

if has "${GIT}commit([[:space:]]|$)"; then
  dir="${CLAUDE_PROJECT_DIR:-$PWD}"
  branch="$(git -c safe.directory="$dir" -C "$dir" branch --show-current 2>/dev/null || true)"
  if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
    deny "You're on $branch. Create a feature branch first (git switch -c agent/<topic>) as a separate command, then commit."
  fi
fi

exit 0
