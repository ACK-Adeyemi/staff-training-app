# Build progress
Status: IN PROGRESS
Mode: unattended
Branch: agent/poc-build
Current milestone: M3
Milestone base commit: bb460c4
Next step: M3 chunk 21 (Track A steps 2, 5 upload, 6, 8, 9 in e2e/track-a.spec.ts; routes/axe/text-scale/no-network audit; docs/demo-script.md; review-checklist M3 entries; screenshot review; final check). Then security-reviewer and code-reviewer on git diff bb460c4...HEAD against docs/plans/m3.md.

## Milestones
- [x] M0 Foundations
- [x] M1 Client story core
- [x] M2 Engagement
- [ ] M3 Client admin depth
- [ ] M4 Provider story
- [ ] M5 Polish and demo readiness
- [ ] M6 Luxury retail pack
- [ ] M7 Battle Room

## Current milestone chunks
M3 (plan docs/plans/m3.md, 21 chunks):
- [x] 1 Decisions, schemas, stores and personas
- [x] 2 Domain: sites, leaderboards, calendar, rules, reminders
- [x] 3 Domain: authoring, stats, feedback, evidence
- [x] 4 Domain: themes, organisation, account, 2FA, billing, retention, exports
- [x] 5 Content
- [x] 6 Data A: identity and organisation
- [x] 7 Data B: billing and account states
- [x] 8 Data C: authoring and files
- [x] 9 Data D: evidence, feedback, tickets, FAQs
- [x] 10 Data E: 10a rules, jobs, reminders, snooze (9db2b4f); 10b leaderboards, themes, exports, erase, retention (tests 40535d7, impl 204209c)
- [x] 11 Seed version 4 (tests 21b1194, impl 96a9f2e)
- [x] 12 UI components
- [x] 13 Client foundations UI (tests b623e08, impl 3f00424)
- [x] 14 Billing UI and Demo AI (tests f1de9c8, impl b25fa65)
- [x] 15 Module Library and Builder UI (15a tests/impl ccc3e09; 15b tests 818c1c0, impl f01ee4d)
- [x] 16 Stats and feedback UI (tests 0411da5, impl 79f0751)
- [x] 17 Evidence UI (tests 52bb2d1, impl fe3d7c0)
- [x] 18 Rules, reminders, notifications and calendars UI (18a tests 91a1552, impl 0e8eb76; 18b tests ebdc820, impl f7d4d08)
- [x] 19 Multi-site, leaderboards and themes UI (19a tests 8f0a7f2, impl 37184f2; 19b tests 88ce68b, impl bf2a636)
- [x] 20 Help, tickets and data UI (20a tests fcf7a8a, impl 1970ac7; 20b tests 1542571, impl c548430)
- [ ] 21 Track A and docs
M2: all 17 chunks done.
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

M2 (final commit 6425abe, scripts/check.sh fully green): BP-1 to BP-8 and F-1 to F-11 each proven by tests listed in docs/plans/m2.md (domain, contract on both adapters, seed, component, Playwright incl. Track A steps 3, 4, 7, axe in light, dark and high contrast, text scale 200%, no-network). Pass. Phone checks deferred to user in docs/review-checklist.md. Security review: FAIL first pass (1 High cross-site standings leak, 2 Medium, several Low), fixed in 6425abe; two Lows (nickname collision, small-team percentages) accepted and logged in docs/decisions.md. Code review: APPROVE with Should fixes left open (builder multi-press UI test confirmation, Switch/Chip use fixed min-h instead of --target-min token, C8 unanswered-order test could pass vacuously, no Pause in read-aloud).

## User feedback
- F1 (M0, ?reset=1): fixed; awaiting user re-check. Cause: editing only the hash (`#/staff?reset=1`) never reloads the page and the hash form was not read. Both forms now work (resetParam.ts, hashchange reload), with e2e for both against the base-path build. Fix commit: see git log "fix: ?reset=1 works before the hash".

## Known issues
- Chunk 14: C19 usage omits Battle Rooms limit (data layer has no count); C6 preview is minimal until chunk 15.
- e2e 'C1 updates in one tab when Jade passes the refresher in another tab' (client-dashboard.spec.ts) failed once, passed on rerun: possible flake, watch it.
- Action versions in deploy.yml unconfirmed (VERIFY, in review checklist). Commit b6146c5 touched protected files (docs/questions-for-user.md).

- e2e flakes seen once each and passing on rerun: client-dashboard.spec.ts (C1 two tabs), track-a.spec.ts desktop. (FIXED in chunk 14: stale module progress after lesson finish; watch only) client-dashboard C1 two-tab flake had recurred in 3 full runs (chunks 11, 13): investigate its cause (cross-tab update timing) at the start of chunk 14 or in M2 review.

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
- 2026-10-26: M2 chunk 7 nursery modules B landed (b25994f), check.sh green. Stopping at a clean point; chunk 8 next.
- 2026-10-26: M2 chunk 8 data layer A landed (dd628aa), check.sh green. Stopping at a clean point; chunk 9 next.
- 2026-10-26: M2 chunk 9 data layer B landed (0ce5b81), check.sh green. Stopping at a clean point; chunk 10 next.
- 2026-10-26: M2 chunk 10 seed (version 3, history, notes, competitions) landed (f910f4d), check.sh green. Stopping at a clean point; chunk 11 next.
- 2026-10-26: M2 chunk 11 UI components landed (f50b9c4), check.sh green. client-dashboard.spec.ts:67 flaked once more in a full run (passed on rerun). Stopping at a clean point; chunk 12 next.
- 2026-10-26: M2 chunk 12 display and accessibility, Me landed (32abca0), check.sh green. Stopping at a clean point; chunk 13 next.
- 2026-10-26: M2 chunk 13 learn and organise landed (b17a9c2), check.sh green. Stopping at a clean point; chunk 14 next.
- 2026-10-26: M2 chunk 14 notes and quiz modes landed (0e06274), check.sh green; C1 two-tab flake root-caused and fixed. Stopping at a clean point; chunk 15 next.
- 2026-10-26: M2 chunk 15 rewards and progress landed (c35028b), check.sh green. Stopping at a clean point; chunk 16 next.
- 2026-10-26: merged origin/main (user feedback); F1 fixed and committed, check.sh green. Chunk 16 next.
- 2026-10-26: M2 chunk 16 compete and admin engagement landed (72395e6), check.sh green. Builder eligibility pickers deferred (see decisions). Stopping at a clean point; chunk 17 next.
- 2026-10-26: M2 complete (chunk 17, reviews, fixes). Final commit 6425abe. M3 next.
- 2026-10-26: M3 base bb460c4; planning.
- 2026-10-26: M3 chunk 1 decisions, schemas, stores (IndexedDB v4), billing.manageAddOns, personas and derived account state landed, check.sh green.
- 2026-10-26: M3 plan committed (b395acf); chunk 1 schemas, stores, personas landed (0bc8159), check.sh green. Stopping at a clean point; chunk 2 next.
- 2026-10-26: merged origin/main (F1 already fixed, awaiting user re-check); M3 chunk 2 domain sites, leaderboards, rules, reminders, calendar landed (be935ac), check.sh green. Stopping at a clean point; chunk 3 next.
- 2026-10-26: e2e flake seen once: compete.spec.ts:88 desktop (waiting for "New competition" link, 120s timeout) in a full run; passed alone and on full rerun. Watch; likely slow load of competitions page when two tabs open under load.
- 2026-10-26: M3 chunk 3 domain authoring, stats, feedback, evidence landed (19904d1), check.sh green. Stopping at a clean point; chunk 4 next.
- 2026-10-26: M3 chunk 4 domain themes, organisation, account, 2FA, billing, retention, exports landed (2e8087c), check.sh green. Stopping at a clean point; chunk 5 next.
- 2026-10-26: M3 chunk 5 content landed (3cd282d), check.sh green. Stopping at a clean point; chunk 6 next.
- 2026-10-26: M3 chunk 6 data A identity and organisation landed (tests 65106ca, impl b91b96c), check.sh green. Stopping at a clean point; chunk 7 next.
- 2026-10-26: M3 chunk 7 data B landed (99ba2ed); check.sh fully green. Decision logged: new billing stores stay deny-all for direct repo access (services scope themselves).
- 2026-10-26: M3 chunk 8 data C landed (e94d15f); check.sh fully green (run by implementer).
- 2026-10-26: M3 chunk 9 data D landed (tests 74c65dc, impl 7b42f2c), check.sh fully green. Stopping at a clean point; chunk 10 next.
- 2026-10-26: M3 chunk 10a landed (tests 041bb4f, impl 9db2b4f), check.sh green. Three test fixtures adjusted without changing assertions (explained in commit). runJobs writes no audit; requirementExpiring assignedBy = first active admin. Stopping at a clean point; chunk 10b next.
- 2026-10-26: M3 chunk 10b data E (leaderboards, themes, exports, erase, retention, reminders send) landed (204209c), check.sh green. Stopping at a clean point; chunk 11 next.
- 2026-10-26: M3 chunk 11 seed version 4 landed (tests 21b1194, impl 96a9f2e), check.sh green. 10b carry-overs (anonymise files, Closed deletion date) done. Stopping at a clean point; chunk 12 next.
- 2026-10-26: M3 chunk 12 UI components landed (tests 280b023, impl 1447299), check.sh green. Added qrcode-generator 2.0.4 and jest-dom 7.0.1 (see docs/decisions.md 'M3 chunk 12'). Stopping at a clean point; chunk 13 next.
- 2026-10-26: M3 chunk 13 client foundations UI landed (tests b623e08, impl 3f00424), check.sh green. Stopping at a clean point; chunk 14 next.
- e2e/two-factor.spec.ts: rare (~1 in 10 isolated runs) timeout in persona/enrol flows under load; added settle waits in 3a-fix commit, full check.sh green. Watch it.
- 2026-10-27: M3 chunk 14 billing UI and Demo AI landed (tests f1de9c8, impl b25fa65), check.sh green. Stopping at a clean point; chunk 15 next.
- 2026-10-27: M3 chunk 15a module library, preview and group assign landed (ccc3e09); billing.spec.ts:120 flaked twice under load (first banner wait now 20s). Chunk 15b next.
- 2026-10-27: M3 chunk 15b module builder landed; check.sh green except the known billing.spec.ts:120 load flake (passes alone). Chunk 16 next.
- 2026-10-27: M3 chunk 15b module builder landed (f01ee4d). Full e2e green on rerun (465 passed); billing.spec.ts:120 flake appeared only in runs overlapping other load. Chunk 16 next.
- 2026-10-27: M3 chunk 16 stats and feedback UI landed (C8 full, C9, C29, S5 to S7, minimal P5 and P10); see docs/decisions.md 'M3 chunk 16'. Chunk 17 next.
- 2026-10-27: M3 chunk 17 evidence UI landed (fe3d7c0), check.sh green. Chunk 18 next.
- 2026-10-27: M3 chunk 18a rules, reminders, notifications landed (0e8eb76). two-factor.spec.ts:67 desktop flaked once under load (known). Chunk 18b next.
- 2026-10-27: M3 chunk 18b calendars landed (f7d4d08), check.sh green. Chunk 19 next.
- 2026-10-27: M3 chunk 19a multi-site and leaderboards landed (37184f2), check.sh green. Chunk 19b next.
- 2026-10-27: M3 chunk 19b themes and eligibility pickers landed (bf2a636), check.sh green. Chunk 20 next.
- 2026-10-27: M3 chunk 20a help and tickets landed (1970ac7). Chunk 20b next.
- 2026-10-27: M3 chunk 20b data and retention landed (c548430), check.sh green. Chunk 21 next.
