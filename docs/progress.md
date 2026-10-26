# Build progress
Status: IN PROGRESS
Mode: unattended
Branch: agent/poc-build
Current milestone: M1
Milestone base commit: (set at M1 start)
Next step: start M1: record base commit, then delegate docs/plans/m1.md to planner (build pack docs/build-pack/10-02-m1-client-story-core.md). Nursery renewal periods still VERIFY.

## Milestones
- [x] M0 Foundations
- [ ] M1 Client story core
- [ ] M2 Engagement
- [ ] M3 Client admin depth
- [ ] M4 Provider story
- [ ] M5 Polish and demo readiness
- [ ] M6 Luxury retail pack
- [ ] M7 Battle Room

## Current milestone chunks
(from docs/plans/m0.md, ticked as they land)
- [x] 1 Workspace and tooling
- [x] 2 Protected names hook
- [x] 3 Domain basics
- [x] 4 Permission engine
- [x] 5 Entitlements, account states, packs, requirement status
- [x] 6 Content scaffold
- [x] 7 Data layer and memory adapter
- [x] 8 Seed generator
- [x] 9 IndexedDB adapter
- [x] 10 UI tokens and base components
- [x] 11 Web app and shells
- [x] 12 Demo shell
- [x] 13 Deploy and docs

## Acceptance criteria results
M0 (final commit f7d32fd, scripts/check.sh fully green): BP-1..BP-8 and F-1..F-10 each proven by the tests listed in docs/plans/m0.md (unit, contract on both adapters, seed, component, Playwright incl. axe, no-network, text-scale, demo-shell). Pass, except deploy parts of BP-1: verified locally (build + preview, base path, hash routing), live check deferred to user in docs/review-checklist.md. Security review: FAIL on first pass (1 High, 3 Medium), all fixed in 1e22e2c; code review: APPROVE.

## Known issues
- Code review Should fix: policy.ts self-approval finds Account Owner by role name; use a stable system role key from domain. Also add a contract test for adminCount with a suspended/expired second admin. Do both early in M1.
- Action versions in deploy.yml unconfirmed (VERIFY, in review checklist). Commit b6146c5 touched protected files (docs/questions-for-user.md).

## Session log
- 2026-10-25: session started, created progress.md, M0 planning.
- 2026-10-25: M0 plan committed (250adaa); starting chunk 1.
- 2026-10-25: M0 chunk 8 seed generator landed (cf69643).
- 2026-10-25: M0 chunk 9 IndexedDB adapter landed (5bfbdb0).
- 2026-10-25: M0 chunk 10 UI tokens and base components landed (adb4330).
- 2026-10-25: M0 chunk 11 web app and shells landed (0816660); check.sh fully green.
- 2026-10-25: M0 chunk 12 demo shell landed (db03240); check.sh fully green.
- 2026-10-25: M0 complete (reviews done, fixes 1e22e2c).
