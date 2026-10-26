# Build progress
Status: IN PROGRESS
Mode: unattended
Branch: agent/poc-build
Current milestone: M2
Milestone base commit: 7c4064d
Next step: M2 chunk 7 (nursery modules B: Safer sleep and What changed in September 2026) from docs/plans/m2.md: test-writer then implementer. Chunks 1-6 done (latest d11c0d1).

## Milestones
- [x] M0 Foundations
- [x] M1 Client story core
- [ ] M2 Engagement (chunks 1-6 done)
- [ ] M3 Client admin depth
- [ ] M4 Provider story
- [ ] M5 Polish and demo readiness
- [ ] M6 Luxury retail pack
- [ ] M7 Battle Room

## Current milestone chunks
M2 (17 chunks, see docs/plans/m2.md 'Work chunks'): chunks 1-6 done; 7 to 17 pending.
M1 (all done):
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
- [x] 12 Track A test and docs

## Acceptance criteria results
M0 (final commit f7d32fd, scripts/check.sh fully green): BP-1..BP-8 and F-1..F-10 each proven by the tests listed in docs/plans/m0.md (unit, contract on both adapters, seed, component, Playwright incl. axe, no-network, text-scale, demo-shell). Pass, except deploy parts of BP-1: verified locally (build + preview, base path, hash routing), live check deferred to user in docs/review-checklist.md. Security review: FAIL on first pass (1 High, 3 Medium), all fixed in 1e22e2c; code review: APPROVE.

M1 (final commit 5b87b6d, scripts/check.sh fully green): BP-1 refresher on 390x844 with branching scenario and evidence with version+site (safeguarding-refresher e2e, contract tests); BP-2 wrong-answer explanation, Learn more links (new tab, icon, domain), results list, learnMoreOpened with no XP (component + e2e); BP-3 draw modes and shuffle (domain tests); BP-4 C1 order and live update (client-dashboard e2e, seed test); BP-5 C4 assigns 3 people with notifications (component + e2e); BP-6 matrix print-to-PDF in Chromium plus visual review of the PNG/PDF (training-matrix e2e); BP-7 Track A steps 1, 3, 5 (matrix part) in track-a.spec.ts. K-1, K-2 fixed. Security review PASS (1 Medium and 2 Low fixed, 1 Low documented); code review CHANGES REQUESTED then all Must/Should fixed in one round (F-9 axe coverage on all new routes). Deferred to user: phone checks in docs/review-checklist.md; CI poppler-utils step in .github/workflows/ci.yml needs the user's review.

## Known issues
- e2e 'C1 updates in one tab when Jade passes the refresher in another tab' (client-dashboard.spec.ts) failed once, passed on rerun: possible flake, watch it.
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
- 2026-10-25: M1 chunk 12 Track A spec, demo script and checklist landed.
- 2026-10-25: M1 complete (chunks 1-12, reviews, fixes). Final commit 5b87b6d.
- 2026-10-26: M2 base 7c4064d, plan docs/plans/m2.md (17 chunks); chunks 1 (schemas, 13afbba) and 2 (engagement domain, 1c6aa7c) landed.
- 2026-10-26: merged origin/main; M2 chunk 3 competitions, standing boards, prize domain landed (cb563cf), check.sh green.
- 2026-10-26: M2 chunk 4 catalogue, notes, display domain landed (40501c5), check.sh green. Stopping at a clean point; chunk 5 next.
- 2026-10-26: M2 chunk 5 engagement content and config landed (c998452), check.sh green.
- 2026-10-26: M2 chunk 6 nursery modules A landed (d11c0d1), check.sh green.
