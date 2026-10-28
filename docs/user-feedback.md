# Feedback from the user

The user writes here after checking a shipped milestone on the live site, and merges it into main. The agents read it at the start of every session (scripts/BUILD_PROMPT.md) and never edit it: they report what they did about each item in docs/progress.md under "User feedback".

Item format: `- [ ] F<number> (<milestone>): what is wrong, where, and what was expected.` The user ticks an item after re-checking the fix on the live site.

## Review checklist results

- M0, checked 26 October 2026 on a phone and on desktop: every item under "Phone and live checks" and "Awaiting review" in docs/review-checklist.md passed, except `?reset=1` (F1). The deploy workflow ran, so the action versions in deploy.yml exist, and Pages deploys from GitHub Actions on the public repository.

## Answers

- Commit b6146c5 and commits by "Agent VM admin" were made by the user. Approved; no need to ask again.
- NSPCC whistleblowing link: <OK, or what's wrong>.
- Themes: preset themes do not count against the savedThemes limit, as the plan says, and "Default dark" can be saved.

## Open items

- [x] F1 (M0): On the live site, adding `?reset=1` to the address does not reset the demo. The Reset demo button in the presenter panel does work. Expected: `?reset=1` resets the demo wherever people are likely to add it: before the hash (`/staff-training-app/?reset=1#/staff`) and at the very end of the address, after the route (`/staff-training-app/#/staff?reset=1`). Add an end-to-end test for both forms against the production build with the GitHub Pages base path.
- [ ] F2 (M3, blocks the M3 pull request): On GitHub Actions (ubuntu-latest, Chromium installed with `playwright install --with-deps chromium`), `e2e/text-scale.spec.ts:160` "S18 and C28 Calendar do not clip or overlap at 200% text" fails in both the phone and desktop projects at line 174: `document.documentElement.scrollWidth` is 404 (phone) and 403 (desktop), expected at most 390. It passes in the dev container, most likely because GitHub's Ubuntu machine has different, wider system fonts. Make the calendar fit at 200% text with wider fonts too (for example: let day and event labels wrap or abbreviate, let grid columns shrink, or bundle the app's font so text measures the same everywhere). Don't loosen the test. Check the other 200% text screens for the same risk.
- [ ] F3 (M3): `e2e/two-factor.spec.ts:67` "each recovery code works once" timed out on GitHub (desktop): after `page.goto('./#/client/signin')`, the Email field did not appear within 30 seconds (line 40). This is the same flaky test seen locally under load. Find the cause (for example a hash route change that doesn't render, or state left over from the previous step) and make it reliable. Don't just raise timeouts.
- [ ] F4 (CI): Keep the `checks` job well under its time limit as the suite grows. Today it spends about 6 minutes installing Chromium and system packages when nothing is cached, and about 9 minutes on end-to-end tests. Cache the Playwright browser download keyed on the Playwright version, stop installing Chromium twice (ci.yml and `scripts/check.sh --install` both do it), and consider more Playwright workers on CI if it doesn't make tests flaky. Keep a single job named `checks`: the branch rules require it.
