# Questions for the user

- Commit b6146c5 ("fix(loop): keep subagents in the foreground in headless sessions", author "Claude Agent") changed scripts/BUILD_PROMPT.md and scripts/run-build.sh, both protected paths. It predates this session and looks harmless. Please confirm you made or approved it; if not, revert it. Default used: left as is.

- M1: the sandbox gets a bot-check (403) from nspcc.org.uk, so the NSPCC whistleblowing link in the Safeguarding module is written from memory and marked VERIFY. Please check it opens the right page. Default used: keep the link, VERIFY listed in docs/review-checklist.md.

- M3 themes: preset themes count against the client's `savedThemes` limit, while the plan says presets do not. The "Default dark" preset also cannot be saved. Default used: the current behaviour (presets count; the `preset` flag stays on the record so this is a one-line change). Please say which you want.
