#!/usr/bin/env bash
# Stop hook. In background runs (AGENT_TASK=1) there's no human watching, so don't let the
# agent finish while scripts/check.sh fails. Gives up after 3 attempts so it can't loop forever;
# the agent is told to report the failure in that case.
set -uo pipefail

[ "${AGENT_TASK:-0}" = "1" ] || exit 0

input="$(cat)"
sid="$(jq -r '.session_id // "unknown"' <<<"$input")"
counter="/tmp/claude-stop-check-$sid"
attempts="$(cat "$counter" 2>/dev/null || echo 0)"
[ "$attempts" -ge 3 ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$PWD}"
if output="$("$root/scripts/check.sh" 2>&1)"; then
  exit 0
fi

attempts=$((attempts + 1))
echo "$attempts" > "$counter"
reason="$(printf 'scripts/check.sh is failing (attempt %s of 3). Fix the failures and commit before finishing. If you cannot fix them, say so plainly at the top of your final report.\n\nLast lines of output:\n%s' \
  "$attempts" "$(tail -n 40 <<<"$output")")"
jq -n --arg r "$reason" '{decision: "block", reason: $r}'
exit 0
