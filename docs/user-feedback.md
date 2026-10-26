# Feedback from the user

The user writes here after checking a shipped milestone on the live site, and merges it into main. The agents read it at the start of every session (scripts/BUILD_PROMPT.md) and never edit it: they report what they did about each item in docs/progress.md under "User feedback".

Item format: `- [ ] F<number> (<milestone>): what is wrong, where, and what was expected.` The user ticks an item after re-checking the fix on the live site.

## Review checklist results

- M0, checked 26 October 2026 on a phone and on desktop: every item under "Phone and live checks" and "Awaiting review" in docs/review-checklist.md passed, except `?reset=1` (F1). The deploy workflow ran, so the action versions in deploy.yml exist, and Pages deploys from GitHub Actions on the public repository.

## Open items

- [ ] F1 (M0): On the live site, adding `?reset=1` to the address does not reset the demo. The Reset demo button in the presenter panel does work. Expected: `?reset=1` resets the demo wherever people are likely to add it: before the hash (`/staff-training-app/?reset=1#/staff`) and at the very end of the address, after the route (`/staff-training-app/#/staff?reset=1`). Add an end-to-end test for both forms against the production build with the GitHub Pages base path.
