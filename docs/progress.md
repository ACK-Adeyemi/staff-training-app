# Build progress
Status: IN PROGRESS
Mode: unattended
Branch: agent/poc-build
Current milestone: M1
Milestone base commit: 5619f46
Next step: M1 chunk 12 (Track A test and docs) per docs/plans/m1.md. Nursery renewal periods still VERIFY.

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
(from docs/plans/m1.md, ticked as they land)
- [x] 1 M0 known issues and decisions
- [x] 2 Learning schemas and quiz engine
- [x] 3 Domain views
- [x] 4 Safeguarding content
- [x] 5 Data layer
- [x] 6 Seed
- [x] 7 UI components
- [x] 8 Staff screens S1-S3, S8
- [x] 9 Staff learning flow S4-S7
- [x] 10 Client screens C1-C4
- [x] 11 C15 matrix and C8 stats
- [ ] 12 Track A test and docs

## Acceptance criteria results
M0 (final commit f7d32fd, scripts/check.sh fully green): BP-1..BP-8 and F-1..F-10 each proven by the tests listed in docs/plans/m0.md (unit, contract on both adapters, seed, component, Playwright incl. axe, no-network, text-scale, demo-shell). Pass, except deploy parts of BP-1: verified locally (build + preview, base path, hash routing), live check deferred to user in docs/review-checklist.md. Security review: FAIL on first pass (1 High, 3 Medium), all fixed in 1e22e2c; code review: APPROVE.

## Known issues
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
- 2026-10-25: M1 base 5619f46, plan docs/plans/m1.md written.
- 2026-10-25: M1 chunk 2 learning schemas and quiz engine landed.
- 2026-10-25: M1 chunk 3 domain views landed.
- 2026-10-25: M1 chunk 4 Safeguarding content landed.
- 2026-10-25: M1 chunk 6 seed landed.
- 2026-10-25: M1 chunk 7 UI components landed.
- 2026-10-25: M1 chunk 8 staff screens landed.
- 2026-10-25: M1 chunk 9 staff learning flow landed.
- 2026-10-25: M1 chunk 10 client screens landed.
- 2026-10-25: M1 chunk 11 C15 matrix and basic C8 landed. Visual review of test-results/matrix-print.png and matrix.pdf (A4 landscape, 2 pages): header, key, status words with icons and dates, team rows and repeating column headings are all readable; nav, Demo badge and buttons are hidden; no clipped columns. No problems found. Also fixed a test bug: the matrix people test compared against every client's people (now Little Acorns only).
