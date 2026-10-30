# Questions for the user

- Commit b6146c5 ("fix(loop): keep subagents in the foreground in headless sessions", author "Claude Agent") changed scripts/BUILD_PROMPT.md and scripts/run-build.sh, both protected paths. It predates this session and looks harmless. Please confirm you made or approved it; if not, revert it. Default used: left as is.

- M1: the sandbox gets a bot-check (403) from nspcc.org.uk, so the NSPCC whistleblowing link in the Safeguarding module is written from memory and marked VERIFY. Please check it opens the right page. Default used: keep the link, VERIFY listed in docs/review-checklist.md.

- M3 themes: preset themes count against the client's `savedThemes` limit, while the plan says presets do not. The "Default dark" preset also cannot be saved. Default used: the current behaviour (presets count; the `preset` flag stays on the record so this is a one-line change). Please say which you want.

## Polish translation review (M5 chunk 6)
The Polish staff interface (packages/content/src/lang/pl-PL.json) was written by Claude and has not been checked by a Polish speaker. Can someone who speaks Polish read it before the demo? See "Polish translation review by a speaker" in docs/review-checklist.md. Counts avoid plural agreement because the message system only has one/other forms; say if you want proper few/many forms added.

## Content review (M5, BP-6)
All nursery modules are Draft. They need a person who knows EYFS practice to read them before real staff see them; the full list with the exact files and `verify` items is in "M1" and "M5" in docs/review-checklist.md. Can you say who will review them, and whether Draft may stay on for the demo? Default used: Draft shown, nothing marked Reviewed.

## Polish review request (M5)
The machine-translated "Safer sleep" module (`safer-sleep-pl`) and the Polish staff strings both need a Polish speaker. Default used: shown as-is with the review noted in the checklist.

## Lighthouse target (M5 chunk 14)
Performance on the phone profile is 0.58 against the 85 placeholder. Do you want to accept 55 now and 70 after splitting the content by industry pack, or invest in the split now? See docs/decisions.md "M5 chunk 14". Default used: left as a VERIFY placeholder.
