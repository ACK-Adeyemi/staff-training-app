# Staff Training App PoC Build Pack

Last updated 22 October 2026. Companion to the product brief, Staff Training App PoC Handoff (Staff_Training_App_PoC_Handoff.md). The brief says what to build and why. This pack says how to build the PoC demo: what to build fully, what to mock, the screens, the data model, seed data, demo scripts, milestones with acceptance criteria, testing, deployment, and how to run Claude Code in Docker on a Linux VM.

The demo has two fully built industries: nurseries (built first) and luxury retail (brief 29), chosen on the demo landing page. The same screens change wording, requirements, content and seed data, which shows that the engine is industry-agnostic.

## 1. How to use this pack

- Read order for a builder (human or Claude Code): this pack's sections 1 to 5, then the brief sections each milestone points to, then the rest of this pack as needed.
- Precedence: the brief wins on product intent (what and why). This pack wins on build detail (how, names, structure). If the two disagree, follow the brief's intent, note the conflict in docs/decisions.md, and tell the user.
- Section references written as "brief 13.4" mean section 13.4 of the product brief. References without "brief" mean this pack.
- Values marked placeholder are starting points. Items marked VERIFY need checking at build time, especially library versions and third-party behaviour.
- Work one milestone at a time (section 10). Each milestone ends with tests passing, a deploy to GitHub Pages, a check of the demo steps it unlocks, and a review by the user on their phone. In an unattended full build (section 14.1), the phone reviews are collected in docs/review-checklist.md and done at the end.
- All data is fictional. Never use real staff, child or client data, and never commit secrets: the repository will be public for free GitHub Pages hosting (brief 9).

## 2. Scope cut

Three levels. Anything not listed is out of scope for the PoC.

### 2.1 Build fully (real logic, working on the device)

Staff app:

- Sign-in screens with invite link, QR join, PIN pad and shared-device user switch (simulated authentication, real flow).
- Home, Learn (search, filters, categories, groups, learning path and Simple view list), module overview, lesson player, quiz engine (multiple choice, true or false, branching scenarios), results, celebrations and certificates.
- Progress: My compliance checklist, Completed, History, XP and level.
- Upload a certificate for training done elsewhere (photo, screenshot or PDF), with Awaiting check, Needs a better copy and Approved outcomes (brief 27).
- Notes in lessons, the course notes panel, My notes with tap-through to the course, show or hide notes in quizzes with the closed-book XP bonus, and closed-book mode for competitions.
- Compete: competition banners, details sheet, live and standing leaderboards with scopes, the Sites board, private own position, and the Battle Room button.
- Battle Room: host or join a live quiz battle (Free for all or Team v team, Accuracy or Speed mode, optional Raise the stakes), lobby, live questions with timer and reveal, podium, personal summary, against simulated players (brief 32).
- Me: profile, hide from leaderboards, badges, display and accessibility settings, language switch, notification centre.
- Help: FAQs, What's new, app feedback sheet, raise a ticket with screenshots and blur tool, My tickets and ticket thread.
- Module feedback: end-of-module card (rating, quick tags, comment, send anonymously), lesson thumbs, and Report a problem with this question (brief 19.1).
- Calendar: Coming up strip on Home, agenda and month views, add to phone calendar (.ics) (brief 28.2).

Client admin app:

- Dashboard (needs attention first, onboarding checklist card, account status banner), staff list grouped by site, person record, assign training, leaver flow.
- Evidence to check: approval queue and review screen for uploaded certificates, and the printable list of current first aiders for parents (brief 27).
- Team calendar with filters, expiry clusters, assign refresher by week, first aiders forecast and .ics export (brief 28.3).
- Module feedback: list across modules, feedback on each module's stats page, rating in the Module Library, reply, status, edit own module, escalate provider module (brief 19.1).
- Auto-assign rules, reminder policy and one-tap nudges.
- Module Library, Module Builder with phone preview, quiz settings, Learn more links and documents (including the overlay on provider modules), versions and publish checklist; categories and groups; per-module stats and the overview with charts.
- Competition builder with prize generator, built-in and custom types, eligibility, live leaderboard toggle and closed-book option; competition detail with winner recording; standing leaderboard settings; Battle Room hosting for admins and battle settings (allow staff to host, cross-site battles, room size, modes available).
- Reports and exports: training matrix (print to PDF), CSV, per site and group, export all data as a ZIP, person export and erase.
- Theme builder with presets, contrast checks, scheduling and preview.
- Team and permissions (simple roles, scope picker, invite, preview as role, activity log).
- Billing, add-ons, plan changes, request-an-add-on flow, account status timeline (all on fake data).
- Data and retention page, help, tickets, feedback, What's new, organisation settings including the organisation profile (display name).

Provider app:

- Platform overview, client list, client detail with all tabs, New client wizard and onboarding progress.
- Provider content library with versions and publish to all or selected clients; industry packs (two full packs, nursery and luxury retail, plus four stub packs); Learn more link management with Check links.
- Profile changes queue for organisation name changes and billing detail requests (P24); battle usage in each client's Usage tab.
- Packages and entitlements with an Option A and Option B switch (Option A by default, brief 20.5), add-on catalogue, dunning view, and Price changes: price overrides and percentage discounts or increases for one or many clients, with a notice period and confirmation (brief 23.11).
- Team and roles: permission matrix, custom roles, invites with roles preset, effective permissions, ownership transfer, security settings, audit log.
- App feedback inbox, module feedback on provider modules (names removed, grouped per module), ticket inbox and ticket detail, support settings (features, issue types, Other entries review, saved replies).
- Announcements and release notes, account recovery requests with dual approval, data request log, status and incidents.

Demo shell:

- Two full industry packs, nursery and luxury retail, switchable from the demo landing page, each with its own wording, requirements, content, seed data and client tour.
- Demo landing page (industry choice, Client tour, Provider tour, Explore freely), Demo as role and persona switcher, presenter panel (Reset demo, Fast-forward time, Simulate failed payment, Jump to role, Toggle status, Open outbox, Clear prospect branding), Demo badges, self-guided tours.

### 2.2 Mock convincingly (simulated and labelled Demo)

- Authentication and 2FA: real screens and flows, fixed demo codes (PIN 1234, authenticator code 123456), and a Demo only badge. No real security.
- Email, push and SMS: never sent. Messages are written to an Outbox that the presenter can open to show what would have been sent.
- Payments: a mock hosted payment page with fake card details and a Demo billing badge.
- AI Assistant: scripted, canned responses for a few prompts per screen, labelled Demo AI (brief 20.7).
- Cross-client usage, API, errors and logs in the provider app: seeded data with a Simulated data badge, plus a real This device tab (brief 15.7).
- Translation: one sample module and the staff interface in one second language, labelled Machine translated (brief 21.4).

### 2.3 Mention only (Coming soon cards or roadmap notes)

- The four stub industry packs (schools, social care, hospitality, construction) beyond their stubs, general (non-luxury) retail, SSO, passkeys and hardware keys, a public API and integrations (for example with nursery management software), self-serve sign-up, a public status page, AI module drafting beyond the canned demo, the freemium plan, buying Records Keeper (show the card only), and the Battle Room big-screen mode and real multi-device live play (brief 32.11).

### 2.4 Content in scope

- Fully written: Safeguarding and whistleblowing (4 lessons, at least 14 questions).
- Written to a shorter standard (2 to 3 lessons, at least 8 questions each): Paediatric first aid and accidents, Safer eating allergies and choking, Safer sleep, What changed in September 2026.
- Tier 2 (1 lesson, at least 5 questions each): suitable people and vetting, ratios and qualifications, risk assessment and outings, medicines, records and data protection.
- Tier 3 shown as Coming soon (brief 7).
- One client-authored sample module: Fire evacuation at Little Acorns (published), plus one draft.
- Luxury retail, provider-authored, written to the shorter standard (2 to 3 lessons, at least 8 questions): store induction, fire safety and evacuation, anti-money laundering for high value dealers, sanctions awareness for luxury goods, data protection and clienteling, retail crime and staff safety. One lesson plus 5 questions each: manual handling and stockrooms, high value cash policy, payment and refund fraud, accessible and inclusive service.
- Luxury retail, client-authored by the fictional Maison Elvaro, a heritage, craftsmanship-led house (brief 29.10): The house story and its workshops, Materials and the making, Care repair and after-sales, The selling ceremony, Clienteling and discretion, Explaining limited availability gracefully, Handling exceptional pieces, the Autumn Winter 2026 collection, and Host store rules for the concession site (section 9.4).
- Section 9 has the content rules and lesson outlines.

### 2.5 Cut order if time runs short

Keep the demo scripts intact (section 8): Tracks A and B for the nursery build, and Track C once M6 starts. Cut in this order, and show a Coming soon card in place of each cut:

1. Second interface language.
2. Demo AI.
3. Custom theme builder (keep presets).
4. Calendar month view and the first aiders forecast (keep the agenda).
5. Data request log and account recovery flow.
6. Incidents and status page.
7. Closed-book competitions (keep the notes toggle and XP bonus).
8. Battle Room Team v team format and cross-site invites (keep Free for all battles on one site).
9. Pulse surveys and You said, we did.
10. Tier 2 module content (keep the cards).

For the luxury retail milestone (M6), cut in this order: the concession site and its host store rules, the Tier 2 retail modules (keep the cards), the second luxury summary client, and the themed logo. Keep Track C steps 1 to 5 and the anti-money laundering, data protection and retail crime modules.

## 3. Stack and conventions

### 3.1 Decisions

- Language: TypeScript in strict mode everywhere. No `any` without a comment explaining why.
- Package manager: pnpm workspaces (VERIFY current version).
- Build: Vite. UI: React with function components and hooks. Routing: React Router with a hash router, because GitHub Pages has no server rewrites.
- Styling: Tailwind CSS driven by design tokens held as CSS variables (brief 6 and 19.4).
- Data fetching in the UI: TanStack Query over the data layer, so the same hooks work with the browser adapter now and the API adapter later.
- Validation: Zod schemas for content files, seed data, imports (CSV, JSON) and data layer inputs.
- Storage: IndexedDB through the small idb wrapper. An in-memory adapter for tests.
- Charts: small hand-built SVG components (progress ring, bar, horizontal bar, line, distribution) with table alternatives. No chart library, to keep size small and control accessibility.
- Utilities (VERIFY each at build time and pin exact versions): a QR code generator, a ZIP library for exports, a PWA plugin for Vite, and fake-indexeddb for tests.
- Internationalisation: all interface text in JSON language files with a typed t() helper. No hard-coded strings in components.
- Testing: Vitest, React Testing Library, Playwright (Chromium) with axe-core accessibility checks.
- Linting and formatting: ESLint and Prettier, run in CI.
- Pin exact versions of every dependency, choose current stable releases at build time, and avoid beta releases.

### 3.2 Conventions

- Ids: ULID strings. Dates: ISO 8601 strings in UTC, displayed in the Europe/London time zone. Money: integer pence.
- Time: no code calls the system clock directly. Use the injected Clock (section 4.2), so Fast-forward time works everywhere.
- Randomness: no direct Math.random(). Use the injected seeded random number generator, so seed data, question draws and prize suggestions are reproducible in tests.
- Neutral names in code: client, site, team, person, requirement, module. Nursery words (setting, room, Ofsted) appear only in the nursery pack's content and terminology (brief 12.8).
- Permissions and entitlements: never check a role name in UI code. Always ask the domain functions can() and entitled(). Never hide a button without the data layer also refusing the action.
- Tenancy: every client-owned record has a clientId, and siteId where relevant. Every data layer call is scoped to the acting user and client.
- Accessibility: every interactive element has a 44 CSS pixel minimum target, a visible focus state and a label. Never rely on colour alone (brief 6).
- Copy: plain English, short sentences, no jargon. Staff never see payment wording (brief 24.8).

## 4. Repository and architecture

### 4.1 Repository layout

```
staff-training-app/
  CLAUDE.md                  instructions Claude Code loads every session (section 13)
  .claude/rules/             path-scoped rules (section 13)
  README.md                  how to run, test and deploy
  docs/
    brief.md                 copy of the product brief
    build-pack.md            copy of this pack
    decisions.md             running log of build decisions and conflicts
    demo-script.md           the master demo scripts, Tracks A, B and C (section 8)
  package.json  pnpm-workspace.yaml  tsconfig.base.json
  .devcontainer/             devcontainer.json and Dockerfile (section 12)
  .github/workflows/         ci.yml (lint, typecheck, test, e2e) and deploy.yml (Pages)
  packages/
    domain/                  pure TypeScript business rules, no browser or UI code
    data/                    DataStore interface, browser adapter, memory adapter, contract tests
    content/                 industry packs: modules, questions, FAQs, prizes, categories,
                             support taxonomy, badge and level definitions, language files
    seed/                    deterministic seed generator for clients, people, history and more
    ui/                      design tokens, components, charts, icons
  apps/
    web/                     the single Vite app: /staff, /client, /provider and the demo shell
  e2e/                       Playwright tests: demo scripts, accessibility, smoke tests
```

One deployable app keeps GitHub Pages simple. The code is split so the three surfaces could become separate apps later, and so packages/domain and packages/data can be reused by a production backend.

### 4.2 Domain package (packages/domain)

Pure functions over plain data. Everything is unit tested. Suggested modules and key functions (names are suggestions; keep the responsibilities):

- clock: `Clock` with `now()`; `offsetClock(base, offsetMs)` for Fast-forward time.
- rng: seeded random number generator; `pick`, `shuffle`, `sample`.
- permissions: `effectivePermissions(user, assignments, roles, now)` returns the union of role permissions plus grants minus denies, filtered by scope and expiry; `can(perms, permissionId, target)`; `canGrant(granter, permissionIds)` blocks privilege escalation; `lastOwnerGuard(...)` (brief 22.4 and 22.7).
- clientRoles: compile simple client role levels (No access, View, Manage plus sensitive Allow toggles) into permission ids (brief 22.5).
- entitlements: `entitlements(package, activeAddOns, accountState)`; `checkLimit(entitlements, usage, key)`; `entitled(entitlements, feature)` (brief 20.6).
- pricing: `priceFor(client, package, addOns, adjustments, date)` applies the list price, then any override, then any active percentage adjustment, never below zero, rounded to the penny; `previewPriceChange(draft, clients, now)` returns the current and new price, effective date and monthly revenue effect per client, with warnings for large increases or prices below the floor; `canConfirmPriceChange(actor, draft)` requires the Confirm price changes permission and a step-up code (brief 23.11).
- accountState: `accountStateAt(subscription, payments, policy, now)`; `nextTransition(...)`; `featureAvailability(state, feature)` implementing the matrix in brief 24.4.
- packs: `term(pack, key)` for wording (site, team, audit export label and so on) and `requirementApplies(requirement, person, site)`, which checks job roles and site attributes such as store type or high value dealer registration (brief 29.3 and 29.8).
- requirements: `requirementStatus(requirement, evidence, submissions, now, amberWindowDays)` returning current, expiringSoon, awaitingCheck, overdue, notStarted or notAssigned (brief 9, 12.3 and 27.6).
- evidence: `canApproveEvidence(actor, submission)` blocks approving your own upload or evidence about yourself, with the single-admin exception (brief 27.5); `approveSubmission(...)` creates Evidence with completed and expiry dates and schedules the next renewal; `expiryFor(requirement, submission)`.
- assignments: `dueStatus`, de-duplication, and `evaluateAutoAssign(trigger, people, rules, assignments, evidence, now)` (brief 21.2).
- quiz: `drawQuestions(bank, settings, rng)` for scenario-only, multiple-choice-only, mix with ratio and random draw; `scoreAttempt(...)`; scenario branching outcomes (brief 8).
- learnMore: `learnMoreFor(question, client, site, attempt)` merges official links with the client's overlay (official first, then From your organisation), applies showFor, and returns nothing while a closed-book attempt is in progress; `isSafeLink(url)` requires https (brief 31).
- xp: `xpForEvent(event, ledger, rules, now)` with unique-content rules, the closed-book bonus, the daily cap and no speed rewards; `levelFor(totalXp)`; badges (brief 16.1, 16.3 and 18.3).
- weeklyGoal: active weeks, rest weeks for leave, totals that never reset (brief 16.1).
- competitions: `metric(template, events, window, eligibility, closedBookOnly)` for each template in brief 13.4; `leaderboard(...)` with shared ties and top 10 plus own position; `drawWinners(...)` (brief 13).
- standingBoards: the individual boards in brief 13.5 with All time and This month views, at site, region, country and all-sites scope; `availableScopes(client, viewer)` hides scopes that do not apply.
- siteBoards: `siteLeaderboard(measure, sites, people, events, evidence, window, scope, options)` using per-person and percentage measures only, excluding people on leave and new starters, marking small sites, sharing ties, and returning the top 10 plus the viewer's site with the gap to the next place (brief 13.5).
- stats: per-module headline numbers, lesson funnel, question insights, score distribution, completions over time (brief 5.2).
- themes: `contrastRatio`, `validateTheme(tokens)` with the 4.5 to 1 and 3 to 1 rules and fixed semantic colours (brief 19.4).
- retention: `scheduledDeletions(records, policy, accountState, now)` (brief 24.6).
- calendar: `calendarItems(actor, range, filters)` derives staff and team items from requirements, assignments, evidence submissions, competitions, themes, announcements, leave and billing, applying permissions and scope; `firstAiderForecast(people, evidence, siteId, weeks)`; `toIcs(items)` (brief 28).
- feedback: `routeModuleFeedback(feedback, module)` sends it to client admins in scope and, for provider modules, a copy with names removed to the provider; `canReplyToFeedback(...)` refuses anonymous items (brief 19.1).
- support: `normaliseOtherText`, `groupOtherEntries`, `trending(groups, now)` (brief 25.7).
- battle: `battlePoints(mode, raiseTheStakes, outcome, answeredAtMs, personalTimeLimitMs)` with outcome correct, wrong or noAnswer, implementing brief 32.4 (Raise the stakes: minus 500 wrong, minus 250 no answer; speed bonus measured against each player's own time limit, totals floored at zero by `applyPoints`), `teamScore(members)` as the average per member, `battleQuestionPool(source, players, liveClosedBookCompetitions)` drawing only from modules every player has completed, `simulateAnswer(persona, question, rng)` for simulated players using their accuracy history and varied response times, `battleXp(correctCount, ledger, now)` with the per-battle and daily caps, and `podium(participants)` with shared ties and hidden-player names shown as "A colleague" (brief 32).
- prize: the suggestion list from the active industry pack (20 general suggestions for nurseries, a luxury list for retail) and `nextSuggestion(list, previous, rng)` with no immediate repeats (brief 13.3 and 29.10).
- organisation: `displayNameAt(client, date)` for certificates issued under an earlier name, `needsProfileReview(client)`, and `formerlyNote(client, now)` for exports (brief 30).

### 4.3 Data layer (packages/data)

- One `DataStore` interface with a repository per area: clients, sites, people, modules, assignments, evidence, events, attempts, xp, notes, competitions, themes, roles, billing, notifications, outbox, feedback, tickets, announcements, requests, evidence submissions, link overlays, battles, profile changes (name history and billing change requests), telemetry, audit and settings.
- Every method takes an `ActorContext` (user id, side: staff, client or provider, client id, current time) and returns promises.
- The browser adapter (IndexedDB) checks permissions and entitlements through the domain package before every write and filters every read by scope, so it behaves like a server would. This is deliberate: it rehearses server-side enforcement and catches UI shortcuts.
- The memory adapter backs unit and component tests.
- A shared contract test suite runs against both adapters. A future API adapter must pass the same suite.
- Events are append-only. Stats, leaderboards, XP and requirement statuses are computed from events and evidence by domain functions, with optional caching.
- Seeding: `seed.load(store, scenario, seedValue, today)` writes a complete demo world (section 7). Reset demo clears every store and reseeds with the same values.
- Storage budget: compress screenshots on the device and cap total attachment storage (placeholder 50 MB) with a friendly message, because browser quotas vary (VERIFY).

### 4.4 Web app (apps/web)

- Routes: `#/` demo landing, `#/staff/...`, `#/client/...`, `#/provider/...`, `#/demo/...` (section 5 lists every screen).
- App shell per surface: staff uses a bottom tab bar; client and provider use a sidebar on desktop and a bottom bar with More on phones.
- Global providers: data store, clock, current actor, permissions, entitlements, theme, accessibility settings, language, demo state.
- Demo state (current persona, clock offset, tour progress) is kept in IndexedDB with localStorage for small flags, wrapped in try and catch.
- PWA: offline support after first load, with an update prompt when a new version is deployed, and the version number shown in the Demo menu.

## 5. Screen inventory and navigation

Ids (S for staff, C for client admin, P for provider, D for demo shell) are used in acceptance criteria (section 10). Each line gives the route, what the screen does, and the brief sections it implements.

### 5.1 Staff app

Bottom tabs: Home, Learn, Progress, Compete, Me. Header: notifications bell and Help. Calendar (S18) opens from Home and Progress; Battle Room (S19 to S22) opens from a button on Compete and from invitations.

- S1 Sign in, `#/staff/signin`: invite link landing, QR join with approval queue, PIN pad, shared-device user switch, account-needs-attention message in Read-only. Brief 21.1 and 24.3.
- S2 Home, `#/staff`: greeting, compliance ring, Next up card (due training first), weekly goal ring, Coming up strip (next three dates), competition banners, latest badge, My notes button, announcements. Brief 16.2, 13.6 and 26.2.
- S3 Learn, `#/staff/learn`: search, filters sheet with live count, category cards, group rows, Required and Optional badges, learning path or Simple view list. Brief 17.2 and 16.2.
- S4 Module overview, `#/staff/module/:id`: lessons as path nodes, minutes, requirement and renewal info, notes button, start or resume. Brief 16.2.
- S5 Lesson player, `#/staff/module/:id/lesson/:lessonId`: stepper, minutes remaining, Add note sheet, Notes for this course panel, read-aloud, thumbs up or down at the end. Brief 18.1, 18.2, 19.1 and 21.4.
- S6 Quiz, `#/staff/module/:id/quiz`: closed-book or open-book choice when a closed-book competition applies, notes show or hide control with XP label, question types, Report a problem with this question, per-question feedback with descriptive Learn more links (official, then From your organisation; hidden during closed-book attempts). Brief 8, 18.3, 18.4 and 31.
- S7 Results and certificate, `#/staff/module/:id/done`: score, pass or retake, XP earned and why, celebration, badge, certificate view and download, a Review what you missed list with explanations and Learn more links, and the module feedback card (rating, quick tags, comment, send anonymously). Brief 16.3, 19.1 and 31.
- S8 Progress, `#/staff/progress`: tabs for My compliance (status, last done, next renewal, cadence, action), Completed, History (timeline, weekly chart, score trend, download my record) and XP and level. Brief 16.2.
- S9 My notes, `#/staff/notes`: grouped by course with coloured course chips, search, filter, starred; tapping a chip opens the course at the lesson. Brief 18.2.
- S10 Compete, `#/staff/compete`: live competitions with own progress, details sheet (prize, dates, how to win, eligibility, leaderboard if enabled, winners), standing leaderboards with own row highlighted and a scope switch (My site, region, country, all sites, where they apply), and the Sites board with the viewer's site highlighted and what it would take to move up. Brief 13.5, 13.6 and 16.2.
- S11 Me, `#/staff/me`: display name or nickname, hide from leaderboards, badge collection, language, links to settings. Brief 16.2.
- S12 Display and accessibility, `#/staff/me/display`: all settings in brief 19.3 with live preview and reset.
- S13 Notifications, `#/staff/notifications`: list with read state, snooze, quiet hours. Brief 21.3.
- S14 Help, `#/staff/help`: FAQ search and categories, What's new, Send feedback, Raise a ticket (S15), My tickets, ticket thread (S16). Brief 19.2, 25 and 26.2.
- S15 Raise a ticket, `#/staff/help/ticket/new`: steps in brief 25.3, screenshots with blur tool (brief 25.4).
- S16 Ticket thread, `#/staff/help/ticket/:id`: messages, status timeline, reply, resolve, reopen, rate. Brief 25.5.
- S17 Upload certificate, `#/staff/progress/upload/:requirementId`: Go to course link, file picker (camera, gallery, PDF), details form (provider, completed date, expiry, certificate number), expected expiry, submit, then status and resubmit. Brief 27.3.
- S18 Calendar, `#/staff/calendar`: agenda by Today, This week, Next week and Later (default 90 days), month view, item actions, add one item or all to the phone calendar. Brief 28.2.
- S19 Battle Room home, `#/staff/battle`: Host a battle, Join with a code or QR, invitations, scheduled battles, past results. Brief 32.2.
- S20 Host setup, `#/staff/battle/new`: question source (completed modules only), number of questions, timer, format (Free for all or Team v team, with the team rule), Accuracy or Speed mode, Raise the stakes (showing both deductions), standings on or off, invite picker (display name, site, department; own site and, if allowed, other sites), start now or schedule, and the pack's host checklist. Brief 32.2, 32.3 and 32.6.
- S21 Lobby and live battle, `#/staff/battle/:id`: lobby with rules shown (mode, Raise the stakes label, questions, timer), players joining, host controls (pause, skip, remove, end); each question with timer and read-aloud; answer lock; reveal with option counts and explanation; top 3 plus own position; preset emoji reactions only; Simulated players label in the PoC. Brief 32.4, 32.5, 32.7 and 32.8.
- S22 Battle results, `#/staff/battle/:id/results`: podium (top 3), own position privately, personal summary with missed questions, explanations and Learn more links, XP earned and badges; host summary with most-missed questions and, for admin hosts, Assign refresher to those who missed them. Brief 32.7 and 32.9.

### 5.2 Client admin app

Navigation: Dashboard, People, Training, Engage, Reports, Settings, Help. Header: site switcher (multi-site only), account status banner, notifications, Help.

- C1 Dashboard, `#/client`: needs attention first, compliance by requirement, site comparison (groups), onboarding checklist card, latest announcements. Brief 5, 14.2 and 26.1.
- C2 People, `#/client/people`: grouped by site with counts and status, search and filters, flat list option, bulk invite (CSV) and print QR cards. Brief 14.2 and 21.1.
- C3 Person record, `#/client/people/:id`: compliance record fields, requirements, history, assignments, upload evidence on their behalf (needs a different approver), nudge, export this person, erase or anonymise, archive as leaver, transfer site. Brief 5, 14.1 and 26.4.
- C4 Assign training, `#/client/assign`: choose module or group, people, role, team or site, due date, preview of who is affected. Brief 5 and 17.1.
- C5 Auto-assign rules, `#/client/rules`: plain-language rule list, editor, on or off switch, affected-now preview, history. Brief 21.2.
- C6 Module Library, `#/client/modules`: cards or table, Provider or Own badges, status, version, average staff rating, filters and sorts, actions. Brief 5.1 and 19.1.
- C7 Module Builder, `#/client/modules/:id/edit`: paste text or Markdown, lessons, questions, roles, category, quiz settings including notes in quizzes and Learn more display, Learn more links and uploaded documents per question and lesson, phone preview, pre-publish checklist, versions and re-assign choice. For provider modules (read-only), an Add our own links panel writes to the client overlay. Brief 5.1, 8, 18.3 and 31.
- C8 Module stats, `#/client/modules/:id/stats`: headline cards, status bar, lesson funnel, question insights, score distribution, completions over time, people list, staff feedback (rating, tag counts, comments, question reports), Learn more opened counts per question, CSV export. Brief 5.2, 19.1 and 31.5.
- C9 Stats overview, `#/client/stats`: compliance by requirement, role, team and site; overdue and expiring; trends with 30 and 90 day filters. Brief 5.2.
- C10 Categories and groups, `#/client/organise`: create, edit, colour, icon, reorder with buttons, bulk add, group order setting. Brief 17.1.
- C11 Competitions, `#/client/competitions`: live, scheduled, ended, with status. Brief 13.2.
- C12 Competition builder, `#/client/competitions/new`: type, template with its reasoning, name, dates, prize field with Suggest a prize and clear button, eligibility and exclusions, winner selection, live leaderboard toggle, closed-book only, preview of the staff banner. Brief 13.2 to 13.4 and 18.4.
- C13 Competition detail, `#/client/competitions/:id`: leaderboard (admins always), progress, extend end date, cancel, record winners, final standings. Brief 13.2.
- C14 Leaderboard settings, `#/client/leaderboards`: switch standing boards on or off, choose which scopes staff can see for individual boards (default My site only), Sites board measures and scopes, small-site threshold and exclusions, privacy notes, and a full Sites board ranking for group admins with drill-down. Brief 13.5 and 14.2.
- C15 Reports and exports, `#/client/reports`: training matrix print view, CSV exports, per site and whole group. Brief 5 and 14.2.
- C16 Reminders, `#/client/reminders`: policy, frequency cap, quiet hours, templates, digest preview, Chase all overdue. Brief 21.3.
- C17 Themes, `#/client/themes`: presets, builder with contrast checks, schedule, apply to staff or admin app, phone preview, saved count against the limit. Brief 19.4.
- C18 Team and permissions, `#/client/team`: list with role, scope and 2FA status, invite, role templates and custom roles, What can this person do?, Preview as this role, activity log. Brief 22.5.
- C19 Billing, `#/client/billing`: plan card, usage against limits, add-on meters, invoices, payment method, plan change, billing name, address and VAT number with Request a change. Brief 23.2, 23.4 and 30.2.
- C20 Add-ons, `#/client/billing/add-ons`: cards, turn on or off with confirmation, spending caps, trials, requests from people without permission. Brief 23.3.
- C21 Account status, `#/client/account-status`: timeline of states, what works now, next change and date, Fix now. Brief 24.3 and 24.8.
- C22 Data and retention, `#/client/data`: retention settings, scheduled deletions, export all data as a ZIP, request early deletion. Brief 24.6.
- C23 Help, `#/client/help`: FAQs, What's new, feedback, Raise a ticket, My tickets and organisation tickets, ticket thread. Brief 19, 25 and 26.2.
- C24 Settings, `#/client/settings`: organisation profile (display name, short name, live staff preview, name history), sites and teams, staff tickets on or off, pulse surveys, default language, amber window. Brief 14, 19.1 and 25.2.
- C25 Onboarding checklist, `#/client/onboarding`. Brief 26.1.
- C26 Sign in and 2FA, `#/client/signin`: email and password (simulated), authenticator enrolment and code, recovery codes, Can't access your account? Brief 22.6 and 26.3.
- C27 Evidence to check, `#/client/evidence`: queue with who, requirement, waiting time, site filters and overdue highlight; review screen `#/client/evidence/:id` with file viewer beside the entered details, approver checklist, Approve (with date correction), Ask for a better copy, Reject with reason; first aiders list for parents. Brief 27.4.
- C28 Calendar, `#/client/calendar`: agenda and month views, filters by site, team, person, requirement and type, expiry clusters by week, Assign refresher for a week, first aiders forecast with threshold, billing dates for billing permission only, .ics and print export. Brief 28.3.
- C29 Module feedback, `#/client/module-feedback`: list across modules with filters (module, site, tag, rating, status), item detail with reply (not for anonymous items), mark Reviewed, Actioned or No action needed, Edit module at the lesson, Escalate to provider. Brief 19.1.
- C30 Battle settings, `#/client/battles`: allow staff to host, allow cross-site battles, maximum room size, Speed mode and Raise the stakes availability, extra time settings for individuals (private), battles usage against the package limit, and past battles across the organisation. Admins host and play battles using the same screens as staff (S19 to S22). Brief 32.10.

### 5.3 Provider app

Navigation: Overview, Clients, Content, Commercial, Support, Comms, Team and security. Header: Simulated data badge, status indicator, notifications.

- P1 Overview, `#/provider`: totals and trends, clients needing attention, top features. Brief 15.1.
- P2 Clients, `#/provider/clients`: list with sites, staff, package, state, health score, onboarding progress, open tickets; New client. Brief 15.2.
- P3 Client detail, `#/provider/clients/:id`: Overview shows display name, billing name, name history and the Billing name differs badge; tabs Overview, Sites, Staff, Usage, API, Errors and logs, Support tickets, Billing, Modules, Competitions, Audit, plus a This device tab on Errors and logs. Brief 15.3 and 15.7.
- P4 New client wizard, `#/provider/clients/new`. Brief 26.1.
- P5 Content library, `#/provider/content`: provider modules, versions, publish to all or selected clients, what-changed notice, module feedback per provider module across clients with names removed, question reports first, and escalations, plus Learn more link management with a Check links button (simulated in the PoC) and open counts across clients. Brief 5, 5.1, 19.1 and 31.
- P6 Industry packs, `#/provider/packs`: the two full packs (nursery and luxury retail) and four stubs (terminology, roles, requirements, prize lists, host checklists). Brief 12.
- P7 Packages and entitlements, `#/provider/packages`: Option A and Option B switch, limits and flags, Records Keeper card. Brief 20.
- P8 Add-on catalogue, `#/provider/add-ons`. Brief 20.3 and 23.3.
- P9 Dunning, `#/provider/dunning`: clients by account state, amounts outstanding, recovery rate, days to next state, extend grace or pause (sensitive). Brief 24.7.
- P10 App feedback inbox, `#/provider/feedback`: app feedback only (module feedback lives in P5), plus the quick tag list editor. Brief 19.1.
- P11 Ticket inbox, `#/provider/tickets`: filters and saved views, response target countdowns. Brief 25.6.
- P12 Ticket detail, `#/provider/tickets/:id`: thread, context, client info, internal notes, saved replies, assign, status, re-tag, merge, link. Brief 25.6.
- P13 Support settings, `#/provider/support-settings`: Features, Issue types, aliases, archive, merge, reorder, Other entries review with re-tag, saved replies. Brief 25.7.
- P14 Announcements and release notes, `#/provider/comms`: composer with audience, channels, schedule and preview. Brief 26.2.
- P15 Account recovery, `#/provider/recovery`: requests, checks, two approvals, cooling-off countdown. Brief 26.3.
- P16 Data requests, `#/provider/data-requests`: log with due dates. Brief 26.4.
- P17 Status and incidents, `#/provider/status`. Brief 26.5.
- P18 Team and roles, `#/provider/team`: members, invites, role list, role editor with the permission matrix, compare roles, effective permissions, ownership transfer. Brief 22.2 to 22.4.
- P19 Security settings, `#/provider/security`: 2FA policy, sessions, trusted devices. Brief 22.6.
- P20 Audit log, `#/provider/audit`. Brief 22.
- P21 Global content, `#/provider/global`: seasonal themes, prize suggestions, global FAQs, badge and level definitions. Brief 13.3, 16.3, 19.2 and 19.4.
- P22 AI add-on settings, `#/provider/ai`: usage, per-client kill switch, guardrail text (Demo AI). Brief 20.7.
- P23 Sign in and 2FA, `#/provider/signin`. Brief 22.6.
- P24 Profile changes, `#/provider/profile-changes`: organisation name changes with old name, new name and billing name side by side (Keep billing name, Update billing name to match, Ask the client), billing detail change requests (Approve, Edit before approving, Decline), and Revert display name (sensitive). Brief 30.3.
- P25 Price changes, `#/provider/pricing`: drafts, awaiting confirmation, scheduled, active and ended changes; New change: choose clients (one, several by filter, or all), type (price override, percentage discount or percentage increase), scope (plan, one add-on or whole invoice), value, reason, notice in days (default 30), optional end date; preview table with current and new prices, effective dates, revenue effect and warnings; Submit for confirmation; Confirm (sensitive, step-up code) or Cancel. The same panel appears on the Billing tab of P3 for a single client. Brief 23.11.

### 5.4 Demo shell

- D1 Demo landing, `#/`: choose the industry (Nursery or Luxury retail), then Client tour, Provider tour or Explore freely, with a short honest note on what is simulated. The choice can be changed from the Demo menu at any time.
- D2 Presenter panel (hidden behind a long-press on the Demo badge or a keyboard shortcut): Reset demo, Fast-forward time (plus 1 day, 7 days, 30 days, back to today), Simulate failed payment for the selected client, Jump to role or persona, Toggle system status, Open outbox, Clear prospect branding (removes any name, logo or colours entered live by a prospect, brief 29.11).
- D3 Outbox, `#/demo/outbox`: emails, push and SMS that would have been sent.
- D4 Self-guided tour overlay: numbered checkpoints, Try this next list, Skip and Restart.

## 6. Consolidated data model

This replaces the scattered data notes in the brief (sections 9, 12.3, 13.8, 14.3, 16.5, 17.3, 18.5, 22.7, 23.8, 24.9, 25.9 and 26.6) as the single reference. Field lists are the minimum. Add fields as needed, but keep the names. Express the real schema as Zod schemas in packages/domain, with TypeScript types inferred from them.

```ts
type Id = string;          // ULID
type ISODate = string;     // ISO 8601, UTC
type Pence = number;       // integer pence

// ---------- Tenancy and organisation ----------
interface Client {
  id: Id; displayName: string; shortName?: string; industryPackId: Id; packageId: Id;
  accountState: AccountState; createdAt: ISODate; settings: ClientSettings;
  nameHistory: { old: string; new: string; changedBy: Id; changedAt: ISODate;
    reviewStatus: 'pendingReview' | 'billingKept' | 'billingUpdated' | 'clientAsked' | 'reverted' }[];
}
interface BillingProfile { clientId: Id; billingName: string; address: string; vatNumber?: string;
  billingContactEmail: string; updatedBy: Id; updatedAt: ISODate }      // billing name controlled by the provider
interface BillingChangeRequest { id: Id; clientId: Id; requestedBy: Id;
  proposed: Partial<Pick<BillingProfile, 'billingName' | 'address' | 'vatNumber'>>;
  status: 'pending' | 'approved' | 'declined'; reviewerId?: Id; reason?: string; createdAt: ISODate }
interface ClientSettings {
  allowStaffTickets: boolean; pulseSurveys: boolean; defaultLanguage: string;
  amberWindowDays: number;                 // placeholder 60
  battles: { allowStaffHost: boolean; allowCrossSite: boolean; maxRoomSize: number;
    speedModeAvailable: boolean; raiseTheStakesAvailable: boolean };   // brief 32.10, all on by default
  reminderPolicy: ReminderPolicy; retention: RetentionPolicy;
}
interface Site { id: Id; clientId: Id; name: string; label?: string;
  countryCode: string; region?: string;                                // drive national and global leaderboard scopes
  status: 'active' | 'archived'; timezone: string; refs?: Record<string, string>   // e.g. Ofsted URN
  attributes?: Record<string, string | boolean> }   // pack-defined, e.g. { storeType: 'flagship', hvdRegistered: true }
interface Team { id: Id; clientId: Id; siteId: Id; name: string }         // rooms or departments

// ---------- People and accounts ----------
interface Person {                         // a learner; admins who also learn link to one
  id: Id; clientId: Id; primarySiteId: Id; additionalSiteIds: Id[]; teamIds: Id[];
  firstName: string; lastName: string; nickname?: string; jobRoleIds: Id[];
  qualificationLevel?: string; startDate: ISODate; leftDate?: ISODate;
  status: 'invited' | 'active' | 'onLeave' | 'archived';
  pausedUntil?: ISODate; prefs: LearnerPrefs;
}
interface LearnerPrefs {
  hideFromLeaderboards: boolean; simpleView: boolean; textScale: number; uiScale: number;
  contrast: 'standard' | 'high'; colourMode: 'auto' | 'light' | 'dark'; reduceMotion: boolean;
  sound: boolean; haptics: boolean; readingFont: 'default' | 'dyslexiaFriendly';
  biggerButtons: boolean; language: string; quietHours?: { from: string; to: string };
  battleExtraTimePercent: 0 | 50 | 100;    // private reasonable adjustment (brief 32.5)
}
interface UserAccount {                    // anyone who signs in
  id: Id; side: 'staff' | 'client' | 'provider'; clientId?: Id; personId?: Id;
  email?: string; displayName: string; status: 'invited' | 'active' | 'suspended';
  login: { method: 'pin' | 'emailPassword'; pinSet: boolean };
  twoFactor?: { enrolledAt: ISODate; recoveryCodesLeft: number };     // simulated in the PoC
  lastActiveAt?: ISODate;
}
interface JobRole { id: Id; packId?: Id; clientId?: Id; name: string }  // Practitioner, Cook, DSL...

// ---------- Industry packs and content ----------
interface IndustryPack { id: Id; name: string; status: 'full' | 'stub';
  terminology: Record<string, string>;     // e.g. nursery { site: 'setting', team: 'room', auditExport: 'Inspector-ready' },
                                           //      retail  { site: 'store', team: 'department', auditExport: 'Audit-ready' }
  jobRoles: JobRole[]; requirements: Requirement[]; defaultCategoryIds: Id[];
  defaultRules: AutoAssignRule[]; faqIds: Id[]; supportFeatureIds: Id[]; prizeSuggestions: string[] }
interface Requirement { id: Id; packId?: Id; clientId?: Id; name: string;
  appliesTo: { all?: boolean; jobRoleIds?: Id[]; siteAttributes?: Record<string, string | boolean> }; renewEveryMonths?: number;
  evidence: ('module' | 'external')[]; satisfiedByModuleIds: Id[]; sourceRef?: string;
  acceptsExternal: boolean;                // true when evidence includes 'external' (brief 27.2)
  acceptedProviders: { name: string; courseUrl?: string }[];
  expiryMode: 'fromCertificate' | 'fromRenewalPeriod'; approverChecklist: string[] }
interface Module { id: Id; owner: 'provider' | { clientId: Id; siteId?: Id };
  title: string; description: string; estimatedMinutes: number; language: string;
  status: 'draft' | 'published' | 'archived'; version: number; requirementIds: Id[];
  roleTags: Id[]; lessons: Lesson[]; questions: Question[]; quiz: QuizSettings;
  sourceAttribution?: string; translatedFrom?: { moduleId: Id; machine: boolean };
  clientReviewRequired?: boolean }        // legal-topic modules: Draft label until the client marks them reviewed
interface LearnMoreLink { id: Id; title: string; url?: string; attachmentId?: Id; publisher: string;
  kind: 'official' | 'legislation' | 'regulator' | 'organisation' | 'other'; locator?: string;   // e.g. 'paragraph 3.37, page 30'
  language: string; showFor: 'wrong' | 'all'; lastCheck?: { at: ISODate; status: 'ok' | 'broken' | 'unknown' } }
interface ClientLinkOverlay { clientId: Id; siteId?: Id; moduleId: Id; questionId?: Id; lessonId?: Id;
  links: LearnMoreLink[]; addedBy: Id; addedAt: ISODate }      // client additions, never edits the provider module
interface Lesson { id: Id; title: string; minutes: number; blocks: ContentBlock[]; furtherReading?: LearnMoreLink[] }
type ContentBlock =
  | { kind: 'text'; markdown: string } | { kind: 'keyPoints'; items: string[] }
  | { kind: 'callout'; tone: 'info' | 'warning'; markdown: string }
  | { kind: 'image'; assetId: Id; alt: string } | { kind: 'acknowledge'; statement: string };
interface Question { id: Id; type: 'mcq' | 'trueFalse' | 'scenario'; prompt: string;
  options?: { id: Id; text: string; correct: boolean }[];
  scenario?: { steps: { id: Id; text: string;
    choices: { id: Id; text: string; outcome: 'best' | 'ok' | 'poor'; feedback: string; next?: Id }[] }[] };
  explanation: string; sourceRef?: string; learnMore: LearnMoreLink[]; tags: string[] }
interface QuizSettings { mode: 'scenario' | 'mcq' | 'mix'; mixScenarioShare?: number; drawCount: number;
  shuffleQuestions: boolean; shuffleOptions: boolean; passMark: number; maxRetakes: number | null;
  feedback: boolean; showSourceRef: boolean; notesInQuiz: 'choice' | 'closedBookOnly';
  learnMoreFor: 'wrong' | 'all' }
interface Category { id: Id; clientId?: Id; name: string; colour: string; icon: string; order: number }
interface ModulePlacement { clientId: Id; moduleId: Id; categoryId?: Id; availableToAll: boolean;   // client layer
  reviewedByOrg?: { by: Id; at: ISODate; version: number } }   // for modules with clientReviewRequired (brief 29.9)
interface ModuleGroup { id: Id; clientId: Id; siteId?: Id; name: string; description: string;
  moduleIds: Id[]; inOrder: boolean }

// ---------- Assignment, evidence and rules ----------
interface Assignment { id: Id; clientId: Id; personId: Id; target: { moduleId: Id } | { groupId: Id };
  dueAt: ISODate; source: 'manual' | { ruleId: Id }; assignedBy: Id; createdAt: ISODate;
  status: 'open' | 'done' | 'cancelled' }
interface Evidence { id: Id; clientId: Id; personId: Id; requirementId: Id;
  kind: 'module' | 'external'; completedAt: ISODate;          // external = an approved uploaded certificate expiresAt?: ISODate;
  moduleId?: Id; moduleVersion?: number; language?: string; attachmentId?: Id; siteIdAtTime: Id;
  submissionId?: Id; approvedBy?: Id; approvedAt?: ISODate; selfApproved?: boolean }
interface EvidenceSubmission { id: Id; clientId: Id; siteId: Id; personId: Id; requirementId: Id;
  uploadedBy: Id; fileAttachmentId: Id; providerName: string; completedAt: ISODate; expiresAt?: ISODate;
  certificateRef?: string; status: 'awaitingCheck' | 'needsBetterCopy' | 'approved' | 'rejected' | 'withdrawn';
  reviewerId?: Id; reviewedAt?: ISODate; decisionNote?: string; rejectionReason?: string;
  evidenceId?: Id; createdAt: ISODate }
interface AutoAssignRule { id: Id; clientId: Id; siteId?: Id; enabled: boolean;
  trigger: { type: 'personAdded' | 'roleChanged' | 'movedSite' | 'requirementExpiring'
    | 'startPlusDays' | 'newModuleVersion'; days?: number; requirementId?: Id };
  filters: { jobRoleIds?: Id[]; teamIds?: Id[]; siteIds?: Id[] };
  action: { moduleId: Id } | { groupId: Id }; dueInDays: number }

// ---------- Learning events and progress ----------
interface LearningEvent { id: Id; clientId: Id; siteId: Id; personId: Id; at: ISODate;
  type: 'lessonViewed' | 'lessonCompleted' | 'attemptStarted' | 'questionAnswered'
    | 'attemptFinished' | 'moduleCompleted' | 'noteCreated' | 'badgeEarned' | 'login' | 'learnMoreOpened';
  moduleId?: Id; moduleVersion?: number; lessonId?: Id; questionId?: Id; attemptId?: Id;
  correct?: boolean; scenarioOutcome?: 'best' | 'ok' | 'poor';
  notesVisible?: boolean; attemptMode?: 'open' | 'closed'; competitionId?: Id }
interface Attempt { id: Id; personId: Id; moduleId: Id; moduleVersion: number; mode: 'open' | 'closed';
  questionIds: Id[]; startedAt: ISODate; finishedAt?: ISODate; score?: number; passed?: boolean }
interface XpEntry { id: Id; personId: Id; kind: 'lesson' | 'correct' | 'closedBookBonus' | 'mastery'
  | 'earlyRefresher' | 'weeklyGoal' | 'battle'; amount: number; sourceEventId: Id; at: ISODate }
interface BadgeAward { personId: Id; badgeId: Id; at: ISODate }
interface Note { id: Id; clientId: Id; personId: Id; moduleId: Id; lessonId?: Id;
  body: string; starred: boolean; createdAt: ISODate; updatedAt: ISODate }

// ---------- Competitions ----------
interface Competition { id: Id; clientId: Id; siteIds?: Id[]; type: 'builtIn' | 'custom';
  templateId?: 'masteryMonth' | 'knowledgeBuilder' | 'learningStreak' | 'teamShowdown'
    | 'beatTheExpiry' | 'completeAndWin' | 'scenarioSavvy' | 'closedBookChallenge';
  name: string; description?: string; startAt: ISODate; endAt: ISODate; prizeText: string;
  eligibility: { jobRoleIds?: Id[]; teamIds?: Id[]; siteIds?: Id[]; excludePersonIds: Id[] };
  winnerSelection?: 'top' | 'draw' | 'teamTarget'; winnerCount?: number;
  liveLeaderboard?: boolean; closedBookOnly?: boolean; moduleIds?: Id[];
  status: 'draft' | 'scheduled' | 'live' | 'ended' | 'cancelled';
  winners?: { personId?: Id; teamId?: Id; recordedAt: ISODate }[]; finalStandings?: unknown }
interface BattleRoom { id: Id; clientId: Id; hostUserId: Id; siteIds: Id[]; mode: 'accuracy' | 'speed';
  raiseTheStakes: boolean; format: 'freeForAll' | 'teamVsTeam'; teamRule?: 'site' | 'department' | 'random';
  questionSource: { moduleId?: Id; categoryId?: Id; groupId?: Id; mixed?: boolean }; questionIds: Id[];
  timePerQuestionSeconds: number; showStandings: boolean; simulated: boolean;
  status: 'scheduled' | 'lobby' | 'live' | 'ended' | 'cancelled';
  scheduledAt?: ISODate; startedAt?: ISODate; endedAt?: ISODate; joinCode: string }
interface BattleParticipant { roomId: Id; userId: Id; siteId: Id; teamId?: string; displayName: string;
  hiddenFromLeaderboards: boolean; extraTimePercent: number; simulatedPersonaId?: Id;
  joinedAt: ISODate; leftAt?: ISODate; totalScore: number; finalPosition?: number }
interface BattleAnswer { roomId: Id; questionId: Id; userId: Id; optionId?: Id; correct: boolean;
  answeredAtMs?: number; timeLimitMs: number; points: number }        // points may be negative; total floored at 0
type LeaderboardScope = 'site' | 'region' | 'country' | 'all';
interface StandingBoardSettings { clientId: Id;
  boards: Record<string, { enabled: boolean; staffScopes: LeaderboardScope[] }>;   // individual boards default ['site']
  siteBoard: { enabled: boolean; measures: ('compliance' | 'onTime' | 'participation' | 'knowledge' | string)[];
    staffScopes: LeaderboardScope[]; smallSiteMinActive: number; newStarterGraceDays: number; excludedSiteIds: Id[] } }

// ---------- Themes ----------
interface Theme { id: Id; clientId?: Id; siteId?: Id; name: string; preset?: string;
  tokens: Record<string, string>; logoAssetId?: Id; decorations?: string[];
  schedule?: { startAt: ISODate; endAt: ISODate }; appliesTo: { staff: boolean; admin: boolean } }

// ---------- Roles, permissions and audit ----------
interface Permission { id: string; area: string; action: string; description: string;
  sensitive: boolean; requires: string[] }                // e.g. 'billing.write' requires 'billing.read'
interface Role { id: Id; owner: 'provider' | { clientId: Id }; name: string; description: string;
  colour: string; permissionIds: string[]; system: boolean; version: number;
  clientLevels?: Record<string, 'none' | 'view' | 'manage'>; clientAllows?: string[];
  updatedBy: Id; updatedAt: ISODate }
interface RoleAssignment { id: Id; userId: Id; roleIds: Id[];
  scope: { type: 'all' } | { type: 'clients'; ids: Id[] } | { type: 'sites'; ids: Id[] } | { type: 'own' };
  grants: string[]; denies: string[]; expiresAt?: ISODate; status: 'active' | 'suspended' }
interface Invitation { id: Id; side: 'client' | 'provider'; clientId?: Id; email: string;
  roleIds: Id[]; scope: RoleAssignment['scope']; invitedBy: Id; expiresAt: ISODate;
  status: 'invited' | 'accepted' | 'expired' | 'revoked' }
interface OwnershipTransfer { id: Id; side: 'client' | 'provider'; clientId?: Id; fromUserId: Id;
  toUserId: Id; coolingOffEndsAt: ISODate; demoteFromTo: Id; status: 'pending' | 'done' | 'cancelled' }
interface AuditEvent { id: Id; actorId: Id; actorSide: 'staff' | 'client' | 'provider';
  clientId?: Id; action: string; target: string; before?: unknown; after?: unknown;
  reason?: string; at: ISODate }

// ---------- Commercial ----------
type AccountState = 'trial' | 'active' | 'pastDue' | 'limited' | 'readOnly' | 'closed' | 'deleted' | 'paused';
interface Package { id: Id; name: string; option: 'A' | 'B'; bands: { maxStaff: number; pricePerSite: Pence }[];
  entitlements: Entitlements }
interface Entitlements { ownModules: number | 'unlimited'; savedThemes: number | 'unlimited';
  admins: number | 'unlimited'; autoAssignRules: number | 'unlimited'; liveCompetitions: number | 'unlimited';
  customClientRoles: number | 'unlimited'; closedBookCompetitions: boolean; multiSite: boolean;
  logoBranding: boolean; perSiteThemes: boolean; integrations: boolean; responseTargetHours: number;
  battlesPerMonth: number | 'unlimited'; maxBattlePlayers: number; crossSiteBattles: boolean }
interface AddOn { id: Id; name: string; pricing: { kind: 'flat'; price: Pence } | { kind: 'usage';
  unit: string; pricePerUnit: Pence; includedUnits: number }; adds: Partial<Entitlements> & { flags?: string[] } }
interface Subscription { clientId: Id; packageId: Id; period: 'monthly' | 'annual'; renewalAt: ISODate;
  state: AccountState; stateSince: ISODate; nextStateAt?: ISODate; billingContact: string;
  graceExtendedUntil?: ISODate; timelinePaused?: boolean }
interface AddOnSubscription { clientId: Id; addOnId: Id; status: 'off' | 'on' | 'trial';
  startedAt?: ISODate; endsAt?: ISODate; usageCapPence?: number; usageThisPeriod: number }
interface Invoice { id: Id; number: string; clientId: Id; issuedAt: ISODate; dueAt: ISODate;
  billingNameAtIssue: string; billingAddressAtIssue: string;              // never changes after issue
  lines: { label: string; amount: Pence; siteId?: Id }[]; tax: Pence; total: Pence;
  status: 'paid' | 'due' | 'overdue' | 'refunded' }
interface PaymentAttempt { invoiceId: Id; at: ISODate; result: 'success' | 'softDecline' | 'hardDecline' }
interface PriceAdjustment { id: Id; clientIds: Id[]; scope: { kind: 'plan' } | { kind: 'addOn'; addOnId: Id } | { kind: 'invoice' };
  type: 'override' | 'percent'; value: number;      // pence for an override; signed percentage, e.g. -10 or 5
  reason: 'loyalty' | 'retention' | 'introductory' | 'annualReview' | 'correction' | 'other'; note?: string;
  noticeDays: number;                                // default 30
  effectiveAt?: ISODate; endsAt?: ISODate;
  status: 'draft' | 'submitted' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  createdBy: Id; confirmedBy?: Id; confirmedAt?: ISODate }
interface DunningPolicy { graceDays: number; limitedUntilDay: number; readOnlyUntilDay: number;
  closedUntilDay: number; deleteWithinDays: number }    // placeholders 14, 30, 60, 150, 30
interface RetentionPolicy { leaverRecordsMonths: number; notesAfterLeaveDays: number;
  eventDetailMonths: number; feedbackMonths: number; ticketMonthsAfterClose: number;
  attachmentDaysAfterClose: number; trialDeleteDays: number }
interface ReminderPolicy { dueOffsetsDays: number[]; expiringOffsetsDays: number[];
  weeklyCapPerPerson: number; quietHours: { from: string; to: string }; escalateAfterDays?: number }

// ---------- Communication, help and support ----------
interface Notification { id: Id; userId: Id; kind: string; title: string; body: string;
  link?: string; createdAt: ISODate; readAt?: ISODate; snoozedUntil?: ISODate }
interface OutboxMessage { id: Id; channel: 'email' | 'push' | 'sms'; to: string; subject?: string;
  body: string; at: ISODate; reason: string }          // demo only: nothing is really sent
interface AppFeedback { id: Id; clientId?: Id; siteId?: Id; userId: Id; side: 'staff' | 'client';
  kind: 'idea' | 'problem' | 'praise'; rating?: number; text: string;
  context: Record<string, string>; status: 'new' | 'triaged' | 'planned' | 'done' | 'wontDo';
  tags: string[]; createdAt: ISODate; ticketId?: Id }                 // goes to the provider
interface ModuleFeedback { id: Id; clientId: Id; siteId: Id; personId?: Id; anonymous: boolean;
  moduleId: Id; moduleVersion: number; lessonId?: Id; questionId?: Id;
  kind: 'moduleCard' | 'lessonThumb' | 'questionReport'; rating?: number; thumb?: 'up' | 'down';
  tags: string[]; text?: string; status: 'new' | 'reviewed' | 'actioned' | 'noAction';
  reply?: { byUserId: Id; text: string; at: ISODate }; escalatedToProvider?: { by: Id; note: string; at: ISODate };
  createdAt: ISODate }                                                 // goes to client admins; provider copy has no personId
interface CalendarItem {                                               // derived, never stored
  id: string; date: string; allDay: boolean; kind: 'due' | 'renewal' | 'awaitingCheck' | 'competition'
    | 'theme' | 'announcement' | 'maintenance' | 'leave' | 'starter' | 'billing' | 'accountState' | 'weeklyGoal'
    | 'battle';
  title: string; count?: number; personIds?: Id[]; siteId?: Id; link: string }
interface Faq { id: Id; app: 'staff' | 'client'; clientId?: Id; category: string; question: string;
  answerMarkdown: string; order: number; helpfulYes: number; helpfulNo: number }
interface SupportFeature { id: Id; name: string; description: string; icon: string; area: string;
  order: number; status: 'active' | 'archived'; aliases: string[]; translations?: Record<string, string> }
interface IssueType { id: Id; name: string; description: string; order: number;
  status: 'active' | 'archived'; aliases: string[]; translations?: Record<string, string> }
interface Ticket { id: Id; number: string; clientId: Id; siteId?: Id; raisedBy: Id;
  raiserSide: 'staff' | 'client'; sharedWithManager: boolean;
  featureId?: Id; featureOtherText?: string; issueTypeId?: Id; issueTypeOtherText?: string;
  title: string; description: string; impact: 'blocked' | 'workaround' | 'question';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'received' | 'inProgress' | 'waitingForCustomer' | 'resolved' | 'closed';
  internalStatus?: string; assigneeId?: Id; tags: string[]; context: Record<string, string>;
  linkedErrorIds: Id[]; linkedFeedbackId?: Id; createdAt: ISODate; updatedAt: ISODate;
  firstResponseAt?: ISODate; resolvedAt?: ISODate; closedAt?: ISODate; satisfaction?: 'up' | 'down' }
interface TicketMessage { id: Id; ticketId: Id; authorId: Id; side: 'customer' | 'provider';
  body: string; internal: boolean; attachmentIds: Id[]; createdAt: ISODate }
interface Attachment { id: Id; ownerId: Id; mime: string; bytes: number; blobKey: string;
  redacted: boolean; alt?: string; uploadedBy: Id; createdAt: ISODate }
interface OtherEntryGroup { id: Id; field: 'feature' | 'issueType'; normalised: string; examples: string[];
  ticketIds: Id[]; count: number; firstSeen: ISODate; lastSeen: ISODate;
  review: 'unreviewed' | 'mapped' | 'created' | 'ignored'; outcomeId?: Id }
interface SavedReply { id: Id; title: string; body: string }    // supports {{firstName}}
interface Announcement { id: Id; title: string; body: string; link?: string;
  audience: { clientIds?: Id[]; packageIds?: Id[]; packIds?: Id[]; sides: ('staff' | 'client')[] };
  channels: ('banner' | 'notification' | 'email')[]; publishAt: ISODate; expiresAt?: ISODate;
  createdBy: Id; reads: number }
interface ReleaseNote { id: Id; title: string; body: string; date: ISODate;
  feedbackIds: Id[]; moduleVersions: { moduleId: Id; version: number }[] }
interface OnboardingChecklist { clientId: Id; steps: { key: string; doneAt?: ISODate }[];
  startedAt: ISODate; completedAt?: ISODate }
interface RecoveryRequest { id: Id; clientId: Id; subjectUserId: Id; requester: string; reason: string;
  checks: { key: string; doneBy: Id; at: ISODate }[]; approvals: Id[]; coolingOffEndsAt?: ISODate;
  outcome?: 'reset2fa' | 'transferOwner'; status: 'open' | 'approved' | 'done' | 'rejected' }
interface DataRequest { id: Id; clientId?: Id; kind: 'access' | 'correction' | 'erasure' | 'other';
  requester: string; subjectPersonId?: Id; receivedAt: ISODate; dueAt: ISODate;
  status: 'open' | 'done' | 'rejected'; notes: string; evidence?: string }
interface Incident { id: Id; level: 'normal' | 'degraded' | 'maintenance' | 'incident';
  title: string; updates: { status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  message: string; at: ISODate }[]; startedAt: ISODate; resolvedAt?: ISODate }

// ---------- Provider telemetry (seeded in the PoC) ----------
interface UsageDaily { clientId: Id; date: string; feature: string; count: number; activeUsers: number }
interface ApiDaily { clientId: Id; date: string; endpoint: string; calls: number; errors: number; p95Ms: number }
interface ErrorGroup { id: Id; message: string; count: number; firstSeen: ISODate; lastSeen: ISODate;
  clientIds: Id[]; siteIds: Id[]; usersAffected: number; status: 'open' | 'acknowledged' | 'resolved' }
interface LogEntry { id: Id; at: ISODate; severity: 'info' | 'warning' | 'error'; clientId?: Id;
  siteId?: Id; feature: string; event: string; message: string; sessionId: string }
interface HealthScore { clientId: Id; date: string; score: number; reasons: string[] }
```

## 7. Seed data

Deterministic: the seed generator uses one seed value (placeholder 20261019) and the date of first load as "today", and stores both, so dates always look current and Reset demo reproduces the same world. All names are fictional.

### 7.1 Provider

- Provider name: placeholder "[Product name]" (brief 11: name not chosen). Never use a real company's name or branding.
- Provider team (5): the Owner (the user), Sophie (Support), Raj (Billing), Megan (Content editor), Tom (Read-only). Mixed 2FA states: Tom has not enrolled yet and is inside his grace period.
- Custom provider role: Account manager (clients, tickets and support reports for selected clients only).

### 7.2 Clients

Four fully detailed clients drive the demo:

1. Little Acorns Nursery: single site, 14 active staff plus 1 leaver, Standard package, Active, theme "Little Acorns green" plus a scheduled Christmas theme, onboarding complete except "set up a competition", AI Assistant add-on off.
2. Oak Tree Nurseries: Group package, Active, three sites in England: Riverside (6 staff, about 95 per cent compliant, region South East), Hillside (5 staff, about 80 per cent, South East) and Meadow (4 staff, about 55 per cent, clearly behind, South West). One bank practitioner works at Riverside and Meadow. Group Admin plus a Site Manager per site.
3. Willow Lane Nursery: single site, 8 staff, Essentials package, Past due for 10 days after a card decline, with 4 payment attempts logged.
4. Maison Elvaro (a fictional heritage, craftsmanship-led luxury house, luxury retail pack): Group package, Active, five stores (three in the UK and two overseas), billing name "Elvaro UK Limited" (fictional) so the Billing name differs badge shows. Details in section 7.5.

Nine summary clients (counts, 90 days of usage, invoices and a few tickets, no detailed staff):

- Brookfield Primary School (schools stub pack, Standard, Active)
- Rosewood Care Home (social care stub, Trial, day 12 of 30)
- Harbour Cafe Group (hospitality stub, 4 sites, Active, health score falling)
- Atelier Vasquine (fictional, luxury retail, single boutique, Trial, day 5 of 30)
- Summit Builders (construction stub, Essentials, Active, low usage)
- Sunny Days Pre-school (nursery, Limited, day 20)
- Little Stars Day Nursery (nursery, Read-only, day 40)
- Meadowview Nursery (nursery, Closed, deletion due in 40 days)
- Pebbles Childcare (nursery, Paused for the summer)

### 7.3 Little Acorns people (the main personas)

| Person | Role | Notes for the demo |
|---|---|---|
| Priya Shah | Nursery Manager, Account Owner | All current. Main client admin persona. |
| Daniel Hughes | Deputy Manager and DSL, Supervisor role | No billing permission (used for the request-an-add-on flow). |
| Jade Mills, 24 | Toddler room leader | Avid learner, 2nd on the standing leaderboard. Younger staff persona. |
| Maureen Clarke, 58 | Cook | Food hygiene expiring in 20 days. Simple view on, large text. Older staff persona. |
| Sam Okafor | Practitioner, started 10 days ago | New starter induction group assigned by rule. Almost no history. |
| Ellie Brown, 17 | Apprentice | Paediatric first aid current. |
| Hannah Patel | Baby room leader | Safeguarding expiring on the Wednesday of the cluster week. |
| Chris Wood | Practitioner | Safeguarding expiring on the Thursday of the cluster week. |
| Lucy Evans | Practitioner, part-time | Safeguarding expiring on the Tuesday of the cluster week. |
| Mark Taylor | Pre-school room leader | Paediatric first aid expired 8 days ago (overdue). Uploads his new certificate in the demo. |
| Kasia Nowak | Practitioner | Uses the second interface language. |
| Grace Lee | Practitioner, on leave | Reminders paused, excluded from competitions. |
| Ben Carter | Bank practitioner | Floats between rooms. DfE safeguarding certificate awaiting check for 4 working days. |
| Amira Hassan | Practitioner | Not started on What changed in September 2026. |
| Olivia Grant | Leaver, archived 2 months ago | History kept, not counted. |

Cluster week: the calendar week starting on the Monday two weeks after today. Seeding the three safeguarding expiries on its Tuesday, Wednesday and Thursday puts them in one cluster in the team calendar (Track A step 2), all inside the 60-day amber window.

The dashboard therefore opens with three safeguarding refreshers expiring, one paediatric first aid overdue, one food hygiene expiring, and one module not started.

### 7.4 History, content and activity

- Six months of learning events per person, following their pattern (Jade frequent and accurate, Maureen occasional, Sam two weeks only). Events produce realistic module stats, lesson funnels with visible drop-off at one lesson, and hard questions.
- XP, levels, badges and weekly activity derived from those events by the domain functions, not hand-written.
- Notes: 3 to 6 per persona across modules, some starred.
- Learn more: every provider question with an official source has a link (EYFS framework PDF on GOV.UK with paragraph and page locators for nursery content; GOV.UK high value dealer guidance, legislation.gov.uk and HSE pages for retail). Client overlays: Little Acorns adds its own Safeguarding policy (a fictional PDF) to two safeguarding questions; Maison Elvaro adds its fictional High value cash policy to the cash questions. Seeded opens give question insights realistic counts, and one provider link is seeded as broken so Check links has something to find.
- Categories (6): Safeguarding, Health and safety, Food and nutrition, Sleep and wellbeing, Induction, Our policies. Groups (3): New starter induction (in order), Baby room essentials, Annual refreshers.
- Competitions at Little Acorns: Mastery Month (live, live leaderboard on), Staff bake-off (custom, live), Autumn Complete and Win (ended, winner recorded), Closed-Book Challenge (scheduled).
- Battle Room: 6 past battles across the nursery clients (mixed modes, one with Raise the stakes, one team battle between Oak Tree sites), a battle Jade is invited to scheduled for Friday at 13:15 (in the calendar), and Maureen with a private plus 50 per cent extra time setting. Maison Elvaro: a past London versus Manchester team battle on the AW26 collection.
- Auto-assign rules: New starter induction for new Practitioners (due in 14 days), safeguarding refresher 60 days before expiry, What changed in September 2026 for everyone.
- Billing: 6 months of invoices for every client, add-on states, Willow Lane's failed attempts, and one refunded invoice.
- Price changes: Oak Tree Nurseries has an active 10 per cent multi-site loyalty discount (ongoing); Brookfield Primary School has a confirmed 5 per cent annual review increase taking effect in 18 days, with its notice in the Outbox; one draft change awaits confirmation.
- Support: about 20 tickets across clients in all statuses. Repeated Other phrases: issue type "certificate won't download" 5 times in 30 days (trending), feature "staff rota" 4 times, and 2 one-offs. About 30 app feedback items. About 25 module feedback items across modules, including 3 question reports (one on a provider module), 2 escalations to the provider, several replies, and an Unclear cluster on lesson 2 of the Fire evacuation module. Saved replies (5).
- Provider telemetry: 90 days of UsageDaily, ApiDaily, 40 error groups, about 200 log entries and daily health scores for every client.
- Evidence submissions (3): Ben Carter's DfE safeguarding certificate awaiting check for 4 working days (highlighted), Ellie Brown's food hygiene certificate marked Needs a better copy, and one approved earlier with its audit history. Mark's upload is created live during the demo.
- Profile changes: Oak Tree Nurseries renamed itself "Oak Tree Nurseries Group" 2 days ago, pending provider review; one billing address change request from Harbour Cafe Group.
- Comms: 2 announcements (one live banner), 3 release notes, 1 open recovery request awaiting a second approval, 2 data requests (one due in 6 days), status Normal.
- FAQs: about 10 for each app (brief 19.2 topic lists).

### 7.5 Maison Elvaro (luxury retail demo client)

Fictional. Never use a real brand's name, logo, products or trade dress.

Sites and attributes:

- London flagship: 16 staff, country GB, region London, storeType flagship, hvdRegistered true (so anti-money laundering training applies to relevant staff).
- Manchester boutique: 7 staff, country GB, region North West, storeType boutique, hvdRegistered false (a written no-high-value-cash policy applies instead).
- Concession at Fenwright's (a fictional department store): 2 staff, country GB, region London, storeType concession, hvdRegistered false, plus a Host store rules module for this site only. Marked as a small site on the Sites board.
- Paris boutique: 6 staff, country FR, storeType boutique. Brand modules only; UK compliance requirements do not apply (brief 29.7).
- New York boutique: 7 staff, country US, storeType boutique. Brand modules only, as Paris.

Sites board seed (Collection readiness, this month: the share of client-facing staff, excluding new starters, who have completed the AW26 collection). The seed sets whole people per store so the numbers are achievable:

| Store | Client-facing staff | Completed | Collection readiness |
|---|---|---|---|
| Manchester | 6 | 6 | 100 per cent |
| Paris | 5 | 4 | 80 per cent |
| London | 12 | 8 | 67 per cent |
| New York | 5 | 3 | 60 per cent |
| Concession (small site) | 2 | 1 | 50 per cent |

So London is 2nd in the UK and 3rd of 5 stores worldwide. One more completion (75 per cent) is not enough to pass Paris; two more (83 per cent) put London 2nd worldwide, which is the line the Sites board computes for Marcus in Track C. Across all stores, 22 of 30 client-facing staff have completed the collection (73 per cent).

Departments: Leather goods and saddlery, Silk and textiles, Ready-to-wear, Jewellery and watches, Home and tableware, Fragrance and beauty, Client services, Stock and operations. The house is fictional and craftsmanship-led (brief 29.10): it must not imitate any real house's name, logo, product names, signature colours, packaging, typefaces or store addresses.

Key London people (others at all five stores are generated from the pattern rules):

| Person | Role | Notes for the demo |
|---|---|---|
| Charlotte Ainsley | Store Director, Account Owner | Group-wide. Main client admin persona for Track C. |
| James Okoro | Assistant Store Manager, Site Manager role, Nominated Officer | Anti-money laundering refresher due in 24 days. |
| Marcus Bell, 23 | Client Advisor, Leather goods | Top of the Autumn Winter 2026 Collection Challenge. Younger staff persona. |
| Helen Whitmore, 56 | Senior Client Advisor, Jewellery and watches | Anti-money laundering refresher due in 9 days. Large text and Simple view. Older staff persona. |
| Sofia Marchetti | Client Relationship Manager | Anti-money laundering refresher due in 15 days. |
| Tom Hartley | Stock and Operations Associate | Manual handling refresher overdue by 6 days. |
| Amara Osei | Client Services | Has not started the new sanctions awareness module. |
| Lucas Fernandes | Visual Merchandiser, fire warden | Fire warden certificate awaiting check. |
| Ewa Zielinska | Client Advisor, Ready-to-wear | Uses the second interface language. |
| Noah Whitfield | Alterations Specialist | All current. |
| Zara Ahmed and Ben Ito | Seasonal Advisors | Start in 12 and 19 days; induction group assigned by rule on their start dates. |

Manchester has a Site Manager (Rebecca Lyons); the concession has a Concession Manager (Imogen Shaw) with the Site Manager role.

Seed activity:

- The Autumn Winter 2026 collection group launched 6 days ago and is 73 per cent complete across client-facing staff (see the Sites board table), assigned by an auto-assign rule on the launch date.
- Competitions: AW26 Collection Challenge (Mastery Month template on the collection modules, live leaderboard on), a Closed-Book Product Challenge (scheduled), and an ended Team Showdown between the UK stores won by Manchester.
- Calendar: the anti-money laundering refresher cluster at London, the Holiday capsule launch in 3 weeks, the seasonal advisors' start dates, and Black Friday marked as a peak trading day.
- Module feedback: two advisors tagged lesson 3 of Care repair and after-sales as Out of date (the repair turnaround times changed); one question report on the sanctions module (a provider module, so it also reaches the provider with names removed).
- Theme: "Maison Elvaro noir" (black and warm gold, passing the contrast checks, chosen so it does not resemble any real house) with a fictional monogram logo, using the Group package branding entitlement. AI Assistant add-on on.
- Competitions use the luxury prize list, for example "An afternoon with the repair team" and "Lunch with the Store Director". Celebrations are set to the quiet style: a ring fill and a short message, no confetti.
- Billing: Group package billed per site, 6 months of invoices.
- Support: one ticket about collection images loading slowly on the stockroom tablet.
- Shared-device mode is on at London's back-of-house tablet, because personal phones are not used on the shop floor in this fictional client.

## 8. Master demo scripts

Write these into docs/demo-script.md and turn each step into a Playwright test (section 11). Timings are targets. Before every live demo: open the presenter panel and press Reset demo.

### 8.1 Track A: client tour (about 10 minutes)

1. Dashboard as Priya (1 minute): the compliance ring, needs-attention list (three safeguarding refreshers expiring, Mark's first aid overdue, Maureen's food hygiene), onboarding checklist card, the Little Acorns theme.
2. Calendar and one-tap assign (45 seconds): open the team calendar, see the cluster of three safeguarding expiries, select the week and assign the refresher to all three. Mention that an auto-assign rule would do this automatically and show the rule's plain-language sentence.
3. Staff phone as Jade (2.5 minutes): Home shows Next up and the Coming up strip. Search Learn for the refresher. In a lesson, Add note. Start the quiz with notes hidden (bonus XP label), answer a branching scenario, deliberately get one question wrong to show the explanation with "Learn more: EYFS paragraph 3.4 (GOV.UK)" (check the paragraph when the content is written) and Little Acorns' own Safeguarding policy under From your organisation, see the celebration, the compliance ring turn green, and "You're 2nd of 13". Open My notes and tap the course chip to jump back.
4. Staff phone as Maureen (30 seconds): Simple view, large text, read-aloud on a lesson. "Same app, set up for her."
5. Back to Priya (1 minute): the status is green. Then, as Mark, upload a photo of his new paediatric first aid certificate from My compliance. As Priya, open Evidence to check, compare the photo with the details, and approve it: Mark turns current and the first aiders list for parents updates. Print the inspector-ready training matrix.
6. Module Builder (1.5 minutes): paste a short fire evacuation procedure, split into lessons, add three questions, preview on the phone frame, publish, assign to everyone. Open the stats of the existing Fire evacuation module to show the funnel, hardest questions and staff feedback: several people tagged lesson 2 as Unclear. Reply to one, mark it Actioned, and jump to the lesson in the Module Builder.
7. Competition (1.5 minutes): create Mastery Month, tap Suggest a prize to cycle, edit the amount, set dates, switch the live leaderboard on, publish. Switch to Jade and show the banner and details sheet.
8. Multi-site (1 minute): switch to Oak Tree Nurseries, see staff organised per site and the site comparison, drill into Meadow. Open the Sites board on Participation: Riverside leads, and the region switch shows South East and South West.
9. Optional, if time (1 minute): Daniel taps the locked AI Assistant and sends a request; Priya approves it in Add-ons; Daniel uses Explain this in simpler words (Demo AI).
10. Optional Battle Room (1.5 minutes): as Jade, host a 5-question Safeguarding battle in Accuracy mode with Raise the stakes on, inviting four colleagues (simulated). Show the lobby rules, two questions with the reveal and top 3, then the podium, Jade's summary with Learn more links, and the capped XP. This is a Free for all battle. Mention Speed mode and Team v team battles across sites.

Close: "Everything you have seen runs on your team's own phones. Behind it, our team runs and supports every client. Let me show you."

### 8.2 Track B: provider tour (about 5 minutes)

1. Overview and client list (45 seconds): clients by state, health scores, sites and staff, onboarding progress. Point out the Simulated data badge honestly. Open Profile changes: Oak Tree Nurseries renamed itself; compare it with the billing name and choose Keep billing name.
2. Little Acorns detail (1 minute): usage by feature, errors and logs, and the Audit tab showing Priya's actions from Track A on this device. Then the Content library: feedback on a provider module across all clients, with names removed, and a question report to fix once for everyone. Press Check links to find the seeded broken Learn more link.
3. Support (1.5 minutes): open a Willow Lane ticket with a screenshot, reply with a saved reply, set In progress, add an internal note. Open Support settings, Other entries to review, turn "certificate won't download" into a new issue type and re-tag its 5 tickets.
4. Guardrails (1 minute): Willow Lane is Past due on day 10. Use Simulate failed payment and Fast-forward to show Limited: the client banner, the locked extras, staff still training, exports still available. Pay on the mock page and watch everything return.
5. Control (45 seconds): open the permission matrix, create an Account manager role scoped to selected clients, invite someone by email with the role preset, and show the invitation in the Outbox.
6. Optional pricing (45 seconds): in Price changes, select Harbour Cafe Group and Summit Builders (both at risk), apply a 15 per cent retention discount on the plan for 3 months, change the notice from 30 to 0 days, preview the new prices and revenue effect, submit, and confirm with the demo authenticator code. Open Harbour Cafe Group's Billing tab to show the discount line and end date.
7. Closing slide or screen (15 seconds): security and data commitments (2FA, audit log, staged account states, exports never held hostage, retention schedule), with the honest note that the PoC simulates authentication, payments and messaging.

### 8.3 Track C: luxury retail client tour (about 10 minutes)

Choose Luxury retail on the demo landing page. Same screens as Track A, different industry.

1. Dashboard as Charlotte (1 minute): the wording is now stores, departments and Audit-ready. Group view of five stores (three in the UK, two overseas), needs attention first: the anti-money laundering refresher cluster in London, Tom's overdue manual handling, Lucas's fire warden certificate awaiting check, and the AW26 collection at 73 per cent. The Maison Elvaro noir theme and monogram, and departments named after the house's crafts.
2. Per-store requirements (30 seconds): open Manchester and show that anti-money laundering does not apply there, because it is not registered as a high value dealer. The no-high-value-cash policy module applies instead.
3. Calendar (45 seconds): the refresher cluster, the Holiday capsule launch, the seasonal advisors' start dates and Black Friday. Select the cluster week and assign the refresher.
4. Staff phone as Marcus (1.5 minutes): the AW26 collection lesson on the house story and a key piece, Add note, a product knowledge quiz with notes hidden (closed-book XP bonus), then the Collection Challenge leaderboard with Marcus in first place. Open the Sites board on Collection readiness: London is 2nd in the UK; switch to All sites and it is 3rd of 5 stores worldwide, with the computed line "2 more people completing the collection would put London 2nd worldwide" (section 7.5).
5. Staff phone as Helen (1 minute): Simple view and large text. An anti-money laundering scenario (a client offers to pay a large sum in cash across two visits) with the feedback explaining linked payments and the nominated officer. The module shows the Draft label for the client's compliance team; mention that Charlotte's team can mark it Reviewed by our organisation, adapt a copy, or write their own.
6. Module Builder and feedback (1.5 minutes): paste Holiday capsule product notes, publish into a collection group with an auto-assign rule on the launch date. Then open Care repair and after-sales: two advisors flagged lesson 3 as Out of date because repair times changed. Reply, mark Actioned and jump to the lesson.
7. Evidence (30 seconds): approve Lucas's fire warden certificate in Evidence to check.
8. Audit-ready export (30 seconds): print the London training matrix with the anti-money laundering training records, for a head office audit or an HMRC supervision visit.
9. Make it yours (1 minute, only with the prospect's permission): in Organisation profile, the prospect's team types their own organisation name, then in Themes uploads their logo and enters their colours. Switch to the staff phone: their name, logo and colours appear. Mention that this is stored only on this device and is cleared with Reset demo or Clear prospect branding. Without permission, skip this step.
10. Optional (30 seconds): Charlotte uses Explain this in simpler words on the sanctions lesson (Demo AI; the add-on is already on for this client).
11. Optional Battle Room (1 minute): Charlotte hosts a Team v team battle on the AW26 collection, London versus Manchester, in Speed mode (simulated players), then shows the host summary and assigns a refresher on the most-missed question.

Close as Track A: the provider tour (Track B) works the same for both industries, and the provider app shows Maison Elvaro and Atelier Vasquine alongside the nursery clients.

### 8.4 Self-guided versions

- All three tracks are also guided tours (D4) with the same steps as checkpoints, short captions instead of narration, and a Try this next list at the end.
- The tour starts from a clean Reset, never depends on timing, and can be skipped or restarted at any point.
- Prospects exploring alone can also use Explore freely, with a Reset demo button always visible in the Demo menu.

## 9. Content plan for the PoC

### 9.1 Rules

- Plain English, lessons of 2 to 4 minutes, modules of about 10 minutes or less.
- Every question has an explanation and a source reference (EYFS paragraph). Never invent paragraph numbers: check each one against the framework.
- Every question with an official source has at least one Learn more link to it, with a descriptive title, the publisher and a locator, and the link must match the source reference. Use only official or primary sources (GOV.UK, legislation.gov.uk, HSE, HMRC, ICO and similar) for provider links (brief 31).
- Re-fetch the unread parts of the framework PDF (end of Section 3, Annexes A and C) before writing the safeguarding and first aid content (brief 7).
- Scenarios use fictional names and never describe abuse graphically. Keep the tone calm and professional.
- Every module derived from the EYFS carries an attribution line under the Open Government Licence (VERIFY wording).
- Content is drafted by Claude and reviewed by the user before any demo. Mark drafts as Draft content in the app until reviewed.

### 9.2 Safeguarding and whistleblowing (full)

- Lesson 1, Your role and the DSL: everyone's duty to be alert, the designated safeguarding lead and what they do (EYFS 3.4 and 3.32).
- Lesson 2, Spotting and acting on concerns: signs to notice, what to do and record, contacting children's social care, following up absences (3.4, 3.9, 3.11 and 3.12).
- Lesson 3, Allegations and whistleblowing: what the policy must cover, allegations against staff, telling Ofsted within 14 days, whistleblowing routes including the NSPCC line (3.6 to 3.8 and 3.10).
- Lesson 4, Everyday safety: phones and cameras, suitable people and disclosure, training renewal every two years (3.6, 3.17 and 3.31 to 3.33).
- Question bank: at least 8 multiple choice and true or false, and at least 6 branching scenarios.

### 9.3 Other modules (shorter)

- Paediatric first aid and accidents: first aider on site and on outings, renewal every three years, displaying certificates or a list, recording and notifying accidents (3.37 to 3.40, 3.78 and 3.79).
- Safer eating, allergies and choking: first aider at mealtimes, allergy information and action plans, weaning stages, preventing and recording choking, food poisoning notifications (3.64 to 3.73).
- Safer sleep: the rules for under-twos and checks (3.86).
- What changed in September 2026: safer sleep, regard to screen use, banned dog breeds, safeguarding clarifications, the regulated activity change (brief 7).
- Tier 2 modules as listed in section 2.4, each one lesson plus five questions.
- Client sample: Fire evacuation at Little Acorns (2 lessons, 4 questions), plus a draft "Mobile phone policy" module.

### 9.4 Luxury retail content (brief 29)

Rules: as section 9.1, plus every legal point is checked against current official guidance before writing, and the anti-money laundering, sanctions and retail crime modules ship with clientReviewRequired, so they show a Draft label until each client's compliance team marks them reviewed (brief 29.9). Never name real brands, clients or high-profile people.

Provider modules:

- Store induction (2 lessons): your store and departments, emergency procedures, who to ask, the shop floor and back of house.
- Fire safety and evacuation in store (2 lessons): raising the alarm, evacuation routes and assembly point, fire wardens, keeping exits and stockrooms clear. Source: Regulatory Reform (Fire Safety) Order 2005, article 21.
- Anti-money laundering for high value dealers (3 lessons): what the high value cash limit means (10,000 euros or more, including linked and split payments and cash paid straight into the bank account); red flags (third-party or courier cash, reluctance to give details, unrecorded sales); what to do (follow policy, tell the nominated officer, keep records; VERIFY the rules on not alerting the customer). Sources: GOV.UK high value dealer registration, HMRC handbook ECSH51600, Money Laundering Regulations 2017.
- High value cash policy (1 lesson): the store does not accept high value cash, how to explain that politely, and what to do if a client insists.
- Sanctions awareness for luxury goods (2 lessons): what the luxury goods prohibition covers, why residence matters, red flags, and when to stop and ask a manager. Write only after checking current government guidance (VERIFY).
- Data protection and clienteling (2 lessons): what client data may be recorded, consent for marketing messages, keeping client details off personal phones and out of training notes, discretion with high-profile clients.
- Retail crime, staff safety and conflict (2 lessons): de-escalation, theft and robbery response with staff safety first, incident reporting, and the new offence of assaulting, threatening or abusing a retail worker (Crime and Policing Act 2026; VERIFY commencement).
- Tier 2, one lesson each: manual handling and stockrooms, payment and refund fraud, accessible and inclusive service.

Client modules (Maison Elvaro, fictional):

- The house story and its workshops (2 lessons: the fictional house's founding, its workshops and artisans, why things are made by hand), Materials and the making (2 lessons: leathers, silk and metals, and the steps a piece goes through), Care repair and after-sales (2 lessons, one seeded as out of date), The selling ceremony (2 lessons: welcome, discovery, product story, close, farewell), Clienteling and discretion (1 lesson), Explaining limited availability gracefully (1 lesson), Handling exceptional pieces (1 lesson: showing, handling and securing very high-value items), Autumn Winter 2026 collection (3 lessons with product knowledge questions), Host store rules (1 lesson, concession site only), and a Holiday capsule draft created live in Track C.
- All content describes the fictional house only. Do not reproduce or paraphrase any real house's history, product names, signature items or service policies.
- Luxury prize suggestions (pack list, placeholder amounts, editable as in brief 13.3): An afternoon with the repair team; Lunch with the Store Director (up to £60); A place at the next collection preview evening; An extra paid half day, agreed with your manager; A £50 charity donation in your name; A day visiting a craft workshop (travel included); A wellbeing voucher (up to £50); Dinner for two (up to £100); Theatre tickets for two (up to £120); A product care kit; A personalised notebook and pen set; First choice of shift pattern for one month.

### 9.5 Content file format

- One folder per module in packages/content/packs/<packId>/modules/ (nursery and luxuryRetail; stubs hold at most one sample lesson), with module.json (metadata, quiz settings, questions) and one Markdown file per lesson.
- A Zod schema validates every content file in CI, including that every question has an explanation and a source reference, that every Learn more link uses https, and that questions with a source reference have at least one link.

## 10. Milestones and acceptance criteria

Each milestone is a pull request (or a short series of them). A milestone is done only when its acceptance criteria pass, the definition of done (section 11.2) is met, the build is deployed to GitHub Pages, and the user has reviewed it on their phone (deferred to the end in an unattended build, section 14.1). Screen ids refer to section 5.

### M0 Foundations

Builds: repository layout (4.1), CI, deploy to Pages, the domain package core (clock, rng, permissions, client roles, entitlements, account states, requirement status), the data layer interface with the IndexedDB and memory adapters and the contract test suite, the seed generator (section 7), design tokens and base components, the language file scaffold, the demo shell (D1, D2 skeleton, D3), empty shells for the three apps, and the git-ignored .protected-names file with its pre-commit hook (section 12.2).

Done when:

- `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm e2e` all pass in CI, and the deploy workflow publishes the site.
- The deployed URL opens D1 on a phone, and each app shell loads with its navigation.
- The pre-commit hook blocks a commit containing any name listed in .protected-names (manual check), and .protected-names itself is git-ignored.
- Reset demo produces identical data twice in a row for the same seed value (a test compares hashes of every store).
- Fast-forward time changes requirement statuses as expected (test: a refresher due in 12 days becomes overdue after plus 30 days).
- Permission tests cover: union of roles, grants, denies winning, scope filtering, expiry, no privilege escalation, nobody editing their own roles, the last owner guard, and nobody approving their own evidence (with the single-admin exception flagged).
- Entitlement and account state tests cover every row of the brief 24.4 matrix.
- The same contract suite passes against both adapters, including a test that a client user can never read another client's records.

### M1 Client story core

Builds: S1 to S8 (basic progress), C1 to C4, C15 (training matrix), the quiz engine, the Safeguarding module content, basic module stats, and the live status update from staff to manager.

Done when:

- As Jade, a full Safeguarding refresher can be completed on a 390 by 844 viewport, including at least one branching scenario, and the completion creates evidence with the module version and site.
- A wrong answer shows the explanation with descriptive Learn more links that open in a new tab with the external link icon and domain; the results screen lists missed questions with their links; links show the right-answer setting; opening a link records a learnMoreOpened event and gives no XP (test).
- Quiz settings drive the draw: scenario-only, multiple-choice-only, mix with ratio and random draw are each covered by tests, and shuffle settings are respected.
- C1 lists needs-attention items first and matches the seeded people in section 7.3. After Jade completes the refresher, C1 shows her as current without a reload.
- C4 assigns a module to three people in one action and creates notifications for them.
- C15 prints a readable training matrix to PDF in Chromium (checked by a Playwright print-to-PDF test and a visual review).
- Track A steps 1 (without the onboarding card and theme) and 3 (without notes, XP and leaderboards), and the training matrix part of step 5, run as an automated test. Step 2 needs the calendar and rules from M3.

### M2 Engagement

Builds: S2 to S10 in full (XP, levels, badges, weekly goal, history, celebrations, notes, My notes, closed-book mode, search and filters, compete), C10 to C14 (categories, groups, competitions with the prize generator, leaderboard settings), and S11 and S12 (Me, display and accessibility settings, Simple view).

Done when:

- XP rules are tested: no XP for speed, unique-question credit only, reduced or no XP for repeated content, daily cap, closed-book bonus per question, and the bonus lost for any question answered while notes were visible (brief 16.1 and 18.3).
- Every competition template in brief 13.4 has a tested metric, ties are shared, and leaderboards show the top 10 plus the viewer's private position. People hidden from leaderboards never appear to others.
- The prize button cycles the active pack's suggestions (20 for nurseries) in a shuffled order with no immediate repeat, the text stays editable, and the clear button empties it.
- A closed-book competition counts only attempts started in closed-book mode, and notes and Learn more links cannot be opened during such an attempt; links appear on the results screen afterwards (test).
- A note written in a lesson appears in the course panel headed with the course name, and in My notes under its course chip. Tapping the chip opens that lesson.
- Search finds modules by title, lesson title and category, filters show a live count, and required and due items stay first.
- Every display and accessibility setting in brief 19.3 changes the interface immediately, persists across a reload, and at 200 per cent text nothing is cut off or overlapping on S2, S5, S6 and C1.
- Track A steps 3, 4 and 7 run as automated tests.

### M3 Client admin depth

Builds: C5 to C9, C16 to C29, S13 to S18, multi-site (site switcher, grouping, comparison), and customer-side support, feedback and FAQs.

Done when:

- Client admins with Add learning links and documents can attach links or a PDF to questions and lessons in their own modules and, through the overlay, in provider modules without changing them; the links survive a new provider version where the question still exists; non-https links are refused (test).
- The Module Builder turns pasted Markdown into lessons, saves drafts, shows a phone preview, refuses to publish without passing the checklist, and creates a new version on edit. Completions keep the version they were taken on.
- Provider modules are read-only for clients. Duplicating one creates an editable own module.
- C8 shows the headline cards, lesson funnel, hardest questions and score distribution from seeded events, each chart with a table alternative.
- Auto-assign rules fire on their triggers (person added, role changed, requirement expiring), never create duplicate assignments, and show their plain-language sentence and affected-now preview.
- Reminders respect the weekly cap, quiet hours and paused people, and stop when the training is done. Messages go to the Outbox, never anywhere else.
- The theme builder blocks saving a theme that fails the contrast rules, status colours cannot be changed, schedules switch themes on and off with Fast-forward, and accessibility settings override themes.
- Organisation profile: a person with Edit organisation name changes the display name and the staff app shows it at once; people without the permission cannot (test); certificates issued earlier keep their original name; exports show the formerly note.
- Two-factor: every client admin is asked to enrol (simulated) and is limited after the grace period until enrolled; staff never are (test).
- Team and permissions: a Supervisor without billing permission cannot see billing pages or call billing actions through the data layer (test), and can send a request-an-add-on which an Account Owner can approve.
- Billing and add-ons show the plan, usage against limits, invoices and add-on cards. Turning on the AI Assistant flips its entitlement immediately and unlocks the feature.
- Account state banners and the what-works matrix behave as in brief 24.4 for every state, and exports stay available until Deleted.
- Calendars: the staff agenda shows due training, renewals, awaiting-check items and competitions for the next 90 days and updates with Fast-forward; each item opens its action; the .ics file imports into a phone calendar and holds only titles and dates. The team calendar respects site scope, groups expiries by week, assigns a refresher to everyone in a selected week in one action, shows billing dates only to people with billing permission (test), and the first aiders forecast changes when a first aid certificate is approved.
- Module feedback: the end-of-module card takes a rating, tags and comment in under 20 seconds; anonymous items show no name anywhere and cannot be replied to (test); a reply reaches the staff member's notification centre; feedback on a provider module appears in P5 without the person's name (test), and on a client's own module never reaches the provider beyond counts (test); app feedback appears only in P10.
- External evidence: a staff member uploads a photo or PDF certificate in under a minute; the requirement shows Awaiting check and its reminders pause; a Supervisor at the same site can approve it but cannot approve their own upload (test); approval creates Evidence with the right expiry and the requirement turns current; Needs a better copy and Reject return a clear message with Resubmit; the first aiders list prints from approved certificates.
- Raising a ticket with two screenshots (one blurred) works on a phone in under a minute, the context shown can be removed before sending, and image metadata is stripped.
- Multi-site: People is grouped by site, the site switcher filters every list and stat, floating staff are counted once, and a Site Manager sees only their site.
- Leaderboard scopes and the Sites board: scope switches appear only when the client has more than one site, region or country; individual boards default to My site only; the Sites board uses only per-person and percentage measures (test: two sites with the same rates but different sizes tie); people on leave and new starters are excluded; small sites are marked; staff see the top 10 sites plus their own, never a bottom list (test); group admins see the full ranking; nothing ever mixes clients (test).
- The Data and retention page exports a ZIP of CSV, JSON and certificate files for the client, and the person export and erase tools work with the evidence-keeping warning.
- Track A steps 2, 6, 8 and 9, and the certificate upload and approval part of step 5, run as automated tests.

### M4 Provider story

Builds: P1 to P25, the dunning flow across all three apps, ownership transfer, 2FA simulation, and provider support operations.

Done when:

- P1 to P3 show seeded data with the Simulated data badge, and the This device tab lists real local events and errors.
- P24 lists each name change with the billing name beside it; Keep, Update to match (future invoices only, issued invoices unchanged, test) and Ask the client all work and are audited; a client billing change request can be approved or declined.
- The New client wizard creates a client with sites, package, starter content and an onboarding checklist, and the invited Account Owner appears in the Outbox.
- Publishing a new version of a provider module shows a what-changed notice to every targeted client.
- Check links in P5 reports the seeded broken Learn more link, and Learn more open counts across clients match the seeded events.
- Switching between Option A and Option B packaging changes limits and locked cards in the client app. Option A is the default.
- Price changes: the notice field defaults to 30 days; nothing applies until someone with Confirm price changes confirms with a step-up code (test); the preview matches priceFor for every selected client (test); a confirmed increase sends a notice to the billing contact and Account Owner in the Outbox and shows on the client plan card and calendar for billing permission holders; discounts show as a separate invoice line; issued invoices never change (test); cancelling a scheduled change or passing its end date restores the previous price (test).
- The permission matrix enforces dependencies, flags sensitive permissions, shows effective permissions with the role that grants each one, and an invited user arrives with the preset role. The last owner cannot be removed. Ownership transfer needs acceptance, simulated 2FA confirmation and a cooling-off period that Fast-forward can skip.
- Simulate failed payment walks Willow Lane through Past due, Limited, Read-only and Closed with Fast-forward, each state matching brief 24.4 in the client and staff apps, and paying restores everything.
- The ticket inbox filters, assigns, replies with saved replies, adds internal notes invisible to customers (test), and the customer sees the reply and status change.
- The Other entries review groups the seeded phrases, flags the trending one, and creating an issue type from it re-tags the selected past tickets.
- An announcement appears as a banner for the chosen audience only. A recovery request cannot complete without two different approvers. The maintenance toggle shows a banner in all three apps.
- Track B runs end to end as an automated test.

### M5 Polish and demo readiness

Builds: the remaining module content (section 9), PWA offline support with the update prompt, self-guided tours (D4), the second interface language and the sample translated module, read-aloud, Demo AI canned flows, and an accessibility and performance pass.

Done when:

- Tracks A and B pass as automated tests, and as self-guided tours, from a fresh Reset (Track C is covered by M6).
- After one online visit, the staff app opens and a lesson can be completed offline. Progress is kept when the connection returns.
- axe reports no serious or critical violations on any route, at phone and desktop sizes, in light and dark mode.
- Keyboard-only use works for the main flows. Read-aloud reads lessons and questions, and never reads notes in closed-book mode.
- Lighthouse on the staff home page, phone profile (placeholder targets: Performance 85 or more, Accessibility 95 or more; VERIFY realistic numbers once built).
- All content is reviewed by the user and the Draft content labels are removed, except the client-review label on legal-topic retail modules (brief 29.9, M6).

### M6 Luxury retail pack

Builds: the luxury retail pack (terminology, job roles, requirements with site attributes, departments, FAQs, support feature names, default rules), the provider modules in section 9.4, the Maison Elvaro client modules, the Maison Elvaro and Atelier Vasquine seed data (section 7.5), the industry choice on D1, and Track C.

Done when:

- Switching industry on D1 changes wording everywhere. An automated check of every staff and client route in retail mode finds none of a list of nursery-only words (for example nursery, Ofsted, EYFS, setting, room, child; whole words only, ignoring feature names such as Battle Room), and none of the retail-only words appear in nursery mode.
- Anti-money laundering applies only to relevant roles at stores with hvdRegistered true; Manchester and the concession get the high value cash policy module instead (unit and end-to-end tests).
- UK compliance requirements apply only to sites with country GB; the Paris and New York stores get brand modules only, and the Sites board ranks all five stores on Collection readiness at UK and worldwide scope (test).
- The collection auto-assign rule fires on the launch date and assigns the collection group to client-facing staff only.
- The Audit-ready export prints for one store and for the whole group, using the retail labels.
- Track C passes as an automated test and as a self-guided tour from a fresh Reset.
- Every retail module that covers legal points shows the Draft label until a client admin who can manage modules marks it Reviewed by our organisation, which is recorded in the activity log and removes the label for that client's staff only (test); duplicating it creates an editable own module. A manual check confirms no real brand, client or public figure is named.
- Prospect branding entered live (name, logo, colours) is stored only in the browser, never in the repository or the build, and Reset demo or Clear prospect branding removes all of it (test).
- The luxury pack uses its own prize list and the quiet celebration style.

### M7 Battle Room

Can be built any time after M2, because it depends on the quiz engine, XP and badges. Admin hosting and C30 also need the client roles from M3. Builds: S19 to S22, C30, the battle domain functions, simulated players, seed battles, and the optional Battle Room steps in Tracks A (step 10) and C (step 11).

Done when:

- Scoring matches brief 32.4 in unit tests: Accuracy (1,000 or 0), Speed (500 plus up to 500, measured against each player's own time limit, so a player with extra time who answers at the same fraction of their limit scores the same), Raise the stakes (minus 500 for a wrong answer, minus 250 for no answer, the 250 applied only when the player's own timer runs out), totals never below zero, Free for all positions from each player's own total, Team v team scores as the average per member, and shared ties.
- The question pool contains only questions from modules every player has completed, and never a question from a live closed-book competition (test).
- A staff host can invite colleagues at their own site, and at other sites only when cross-site battles are allowed; an invite picker never shows personal records or another client's people (test).
- The host can choose Free for all or Team v team; Team v team needs at least two players per team and shows team and own positions; Free for all shows one individual scoreboard.
- The lobby shows format, mode, Raise the stakes with both deductions, questions and timer before starting; anyone can leave; declining an invitation has no effect on the person.
- Standings show the top 3 and each player's own position only; nobody sees a last-place screen; players hidden from leaderboards show as "A colleague" (test).
- Notes are locked and Learn more links are deferred to the results screen during a battle.
- XP is the same in both modes, capped per battle and per day, and never goes down; battle results never change standing leaderboards, the Sites board, competitions or compliance (test).
- Simulated players answer with varied, realistic accuracy and timing and are clearly labelled; Reset demo restores the seeded battles.
- The host checklist from the active pack shows before starting (ratios for nurseries, back of house for luxury retail).
- Package limits and account states are enforced: no new battles from Limited onwards (test).

## 11. Testing, definition of done and deployment

### 11.1 Testing

- Unit tests (Vitest) for every domain rule, written as tables of cases including edge cases: ties, leave, leavers, transfers between sites, time zones around midnight, and the last day of a window.
- Contract tests for the data layer, run against the memory and IndexedDB adapters (using fake-indexeddb in Node). The production API adapter will have to pass the same suite.
- Component tests (React Testing Library) for forms, the quiz player, the permission matrix and the theme builder.
- End-to-end tests (Playwright, Chromium): every demo step in section 8, the acceptance criteria above, smoke tests on every route, at a 390 by 844 phone viewport and a 1440 by 900 desktop viewport.
- Accessibility: axe checks inside the end-to-end tests on every route.
- Determinism: tests use a fixed clock and seed. No test depends on the real date.

### 11.2 Definition of done (every task)

- TypeScript strict with no unexplained `any`. Lint, typecheck and tests pass.
- New business rules live in packages/domain with unit tests. The UI never reads or writes storage directly.
- Permission and entitlement checks use can() and entitled(), and the data layer enforces them too.
- All text is in the language files. No hard-coded strings.
- Works at phone size, at 200 per cent text, in dark mode and with reduced motion.
- No real personal data, no secrets, and no calls to external services from the app's code (other than loading the page). Learn more links are ordinary links the user opens in a new tab.
- docs/decisions.md is updated if a decision was made or a conflict with the brief was found.

### 11.3 Deployment to GitHub Pages

- deploy.yml builds on every push to main and publishes with the official GitHub Pages actions (VERIFY current action versions).
- Set the Vite base path to the repository name, and use the hash router.
- Hashed asset file names give cache busting. The PWA shows an "Update available" prompt so a presenter never demos an old version by accident.
- The version and build date show in the Demo menu.
- `?reset=1` on the URL performs Reset demo on load, useful for links sent to prospects.
- Free Pages hosting generally needs a public repository (VERIFY), so the repository holds no secrets and only fictional data.

## 12. Running Claude Code in Docker on a Linux VM

Based on Anthropic's Claude Code documentation on development containers and memory (sources in section 17). Check the current documentation before setting up, because details change (VERIFY).

### 12.1 Recommended setup: a dev container

- Add Claude Code to the repository's dev container with Anthropic's Claude Code Dev Container Feature (`ghcr.io/anthropics/devcontainer-features/claude-code:1.0` at the time of writing). The feature installs the latest Claude Code and Node.js if the base image lacks it. To pin a version instead, install it in the Dockerfile with npm at a fixed version and turn off auto-update.
- On a Linux VM without a desktop editor, start and enter the container with the Dev Containers command-line tool, or build the same Dockerfile with plain Docker. The documentation also points to a reference container in the anthropics/claude-code repository, with a Dockerfile, devcontainer.json and an outbound firewall script.
- Run as a non-root user. Mount the repository as the workspace.
- Persist sign-in across rebuilds: mount a named volume at the user's ~/.claude and set CLAUDE_CONFIG_DIR to the same path.
- Add to the image: pnpm (through corepack), git, and Playwright with Chromium and its system dependencies (VERIFY the install command for the chosen Playwright version).
- Forward ports 5173 (Vite dev server) and 4173 (Vite preview) so the app can be opened from a phone on the same network, or through a tunnel.

### 12.2 Permissions and safety

- For unattended work, Claude Code can be started with `--dangerously-skip-permissions` inside the container, because commands are confined to it. The CLI refuses this flag when run as root. The documentation warns that a container does not stop a malicious project from exfiltrating anything inside it, including Claude Code's own credentials, so use it only with this trusted repository.
- Pair that with outbound network restrictions: allow the npm registry, GitHub and the domains Claude Code needs, and little else (the reference firewall script shows one way). Auto mode is a middle ground that reviews actions before they run, if fewer prompts are wanted without bypassing checks.
- Keep prospect and client names out of the repository: put any protected names in a git-ignored local file (for example .protected-names) and add a pre-commit hook that blocks commits containing them (brief 29.11).
- Never mount host secrets such as ~/.ssh or cloud credential files. Use a GitHub token scoped to this one repository, ideally short-lived.
- Review each milestone's pull request before merging. Claude can change any file in the mounted workspace.

### 12.3 Working rhythm

- One milestone per working session or a small number of sessions. Start each session with the kickoff prompt for that milestone (section 14).
- Claude Code works on a branch, runs lint, typecheck, unit and end-to-end tests before saying a task is done, commits in small steps, and opens a pull request per milestone with a summary of what changed and what to check.
- The user reviews the deployed preview on their phone, and feedback goes into docs/decisions.md and the next session's prompt.

## 13. CLAUDE.md and rules

Claude Code loads ./CLAUDE.md from the repository root into every session. Anthropic's guidance is to keep each CLAUDE.md under about 200 lines, to group instructions under headings, to avoid contradictions, and to move instructions that only matter for part of the codebase into path-scoped rule files in .claude/rules/. CLAUDE.md can import other files with @path syntax, but imports also load at launch, so they do not save context. That is why the brief and this pack are referenced by path below rather than imported.

### 13.1 Draft CLAUDE.md

```markdown
# Staff Training App PoC

Static demo of a staff compliance training app with three surfaces: staff, client admin and provider admin.
Product intent: docs/brief.md. Build plan, screens, data model and acceptance criteria: docs/build-pack.md.
If they conflict, follow the brief's intent, log it in docs/decisions.md and tell the user.

## Commands
- pnpm install
- pnpm dev                    # Vite dev server on port 5173
- pnpm lint && pnpm typecheck
- pnpm test                   # Vitest: domain, data contract and component tests
- pnpm e2e                    # Playwright, Chromium, phone and desktop viewports
- pnpm build && pnpm preview  # production build on port 4173

## Layout
- packages/domain: pure business rules. No browser, UI or storage code.
- packages/data: DataStore interface, IndexedDB and memory adapters, contract tests.
- packages/content: industry packs (nursery and luxury retail, plus four stubs), modules, FAQs, language files.
- packages/seed: deterministic seed data.
- packages/ui: tokens, components, charts.
- apps/web: the Vite app (#/staff, #/client, #/provider, demo shell).
- e2e: Playwright tests, including the demo scripts.

## Always
- Work on one milestone at a time (build pack section 10). Do not start the next without the user, unless docs/progress.md says Mode: unattended (build pack section 14.1).
- Put business rules in packages/domain with unit tests. The UI calls the data layer only.
- Check permissions with can() and features with entitled(). Never check role names in the UI.
- Use the injected Clock and seeded RNG. Never call Date.now() or Math.random() directly.
- Every client-owned record has clientId (and siteId where relevant).
- All UI text goes in language files. Plain English. Staff never see payment wording.
- 44px minimum touch targets, visible focus, never colour alone, works at 200% text and in dark mode.
- Only fictional data. No secrets. No network requests from app code (Learn more links are ordinary links opened in a new tab).
- Before saying a task is done: lint, typecheck, unit tests and the relevant e2e tests pass.

## Never
- Never reward speed in XP, competitions or leaderboards. The one exception is opt-in Speed mode inside a Battle Room, which affects only that room's scores (brief 32.4).
- Never let an account state block exports of compliance records before deletion.
- Never show learner notes to anyone but the learner.
- Never use real companies' names, logos or branding in demo data, prizes or designs. Official sources (GOV.UK, HSE, HMRC, DfE, NSPCC, legislation.gov.uk) are cited by name in content and Learn more links.
- Never write a real prospect or client name anywhere in the repository (the pre-commit hook checks .protected-names).

## Status
- Current milestone: M0 (update this line at the start of each milestone).
- Decisions: docs/brief.md section 3. Still open: docs/brief.md section 11.
```

### 13.2 Suggested path-scoped rules

Check the current documentation for the exact frontmatter format for path scoping (VERIFY). Suggested files:

- .claude/rules/domain.md for packages/domain: pure functions, no side effects, table-driven tests for every rule, cite the brief section in a comment above each rule.
- .claude/rules/data.md for packages/data: every method takes an ActorContext, enforce permissions and scope in the adapter, add a contract test for every new method.
- .claude/rules/content.md for packages/content: Zod-valid files, explanation and source reference on every question, an https Learn more link on every sourced question, OGL attribution on EYFS-derived modules, fictional names only.
- .claude/rules/ui.md for apps/web and packages/ui: tokens not raw colours, table alternatives for charts, keyboard and screen reader checks, no direct storage access.
- .claude/rules/testing.md for e2e: one test per demo step, fixed clock and seed, phone and desktop viewports, axe on every route.

## 14. Kickoff prompts for Claude Code

Two ways to run the build: interactively, one milestone per session with the user reviewing each (the prompts below), or unattended from start to finish (section 14.1).

Interactive: paste one at the start of each milestone session.

M0:

> Read CLAUDE.md, docs/build-pack.md sections 1 to 7, 10 (M0), 11 and 13, and docs/brief.md sections 1 to 3, 9, 12.3, 20.6, 22.7 and 24.4. Then build milestone M0 only. Before writing code, list any conflicts or gaps you find and the defaults you will use, and log them in docs/decisions.md. Finish with the M0 acceptance criteria checked one by one, and stop.

Later milestones (replace Mx and the brief sections):

> Read CLAUDE.md, docs/decisions.md, docs/build-pack.md section 10 (Mx) and the screens it lists in section 5, and the brief sections those screens reference. Build milestone Mx only, in small commits, keeping all earlier tests passing. Finish with the Mx acceptance criteria checked one by one and a short list of what the user should check on their phone, and stop.

### 14.1 Unattended full build

Supplied with these documents: BUILD_PROMPT.md (the prompt sent at the start of every session) and run-build.sh (a loop that starts a fresh headless Claude Code session each time the previous one ends, until docs/progress.md says BUILD COMPLETE or BLOCKED). Fresh sessions keep each one's context small; docs/progress.md carries the state between them.

Setup, once, on the Linux VM:

1. Build the dev container from section 12 and work inside it as a non-root user, with outbound access to the npm registry, GitHub, Anthropic, and the official content sources (gov.uk and its asset domains, legislation.gov.uk, hse.gov.uk).
2. Sign Claude Code in (claude auth login, or a long-lived token from claude setup-token) and check with claude auth status.
3. Create the empty public GitHub repository, authenticate gh with a token scoped to that repository (contents, pull requests, actions, pages and workflows), clone it, and set Pages to deploy from GitHub Actions.
4. Copy the brief to docs/brief.md and this pack to docs/build-pack.md. Put BUILD_PROMPT.md and run-build.sh in scripts/. Never copy the private pitch notes into the repository.
5. Create .protected-names in the repository root with the prospect's name (with and without accents), one per line, and add .protected-names to .gitignore. Commit everything else.
6. Start it: tmux new -s build 'bash scripts/run-build.sh'. Detach and come back later; read docs/progress.md to see where it is.

How it behaves:

- Milestones run in order M0 to M7. Questions are answered from the brief's decisions and logged in docs/decisions.md; anything only the user can answer goes in docs/questions-for-user.md with the default used.
- Each milestone is merged to main through a pull request once CI passes, and deployed. Phone checks are listed in docs/review-checklist.md for the end.
- Content keeps its Draft labels until the user reviews it after the build.
- If it hits something only the user can fix (authentication, permissions, network), it sets Status: BLOCKED with the fix needed and stops. Fix it and run the script again.
- At the end it writes docs/build-report.md: the live URL, what was built, deviations, known issues, content awaiting review and VERIFY items still open.
- A failed session (for example a usage limit) waits 30 minutes and retries. MAX_SESSIONS caps the total (placeholder 80). With API billing instead of a subscription, consider adding --max-budget-usd to the claude command (VERIFY current flags with claude --help).

## 15. From PoC to production

The PoC is built so that most of it carries over. What carries over:

- packages/domain unchanged: the same rules run on the server for enforcement and in the browser for instant feedback.
- packages/content and the Zod schemas, the language files, packages/ui and most of apps/web.
- The data layer interface and its contract tests: the production API adapter must pass the same suite.
- The seed generator, reused to fill staging environments with realistic fictional data.
- The end-to-end tests, which become regression tests for production.

What changes, to be specified in the production engineering spec after PoC feedback:

- A backend and API that enforce permissions, entitlements and account states on every request, and an API adapter in packages/data.
- Architecture choices: database, authentication and 2FA provider, file storage for attachments, email, push and SMS providers, payment provider with hosted pages and Direct Debit, AI provider, scheduled jobs, and hosting in a UK or EU region (decided; VERIFY the UK adequacy position for an EU region).
- Separation of client data in the database, with automated tests that one client can never reach another's data.
- Security: a threat model, standard web application security controls, encryption in transit and at rest, secrets management, rate limiting, security headers, malware scanning of uploads, and an independent penetration test before launch.
- Compliance documents: a data protection impact assessment, privacy notices, terms of service, the processor agreement, a cookie policy if needed, and an accessibility statement.
- Operations: development, staging and production environments, CI and CD, monitoring and alerting, logging with correlation ids, tested backups and restores, incident response, and the retention and deletion jobs from brief 24.6.
- Epics and tickets with acceptance criteria, in the same style as section 10, sized for Claude Code sessions.

## 16. Risks for the PoC build

- Scope: the PoC is large. Use the cut order in section 2.5 and protect the demo scripts.
- Legal content in the luxury retail pack (anti-money laundering, sanctions, retail crime) carries the highest risk: check it against current official guidance, ship it with the client-review Draft label (brief 29.9), and take legal advice before marketing it as compliant.
- Content accuracy: wrong compliance content would damage trust. Every module is reviewed by the user, and every source reference is checked.
- Browser storage limits and clearing: Reset demo and the seed make recovery instant. Keep attachments compressed and capped.
- Old cached versions during a demo: the PWA update prompt and the version shown in the Demo menu.
- Prospects exploring alone may get lost: self-guided tours, Explore freely and an always-visible Reset demo.
- A public repository: no secrets, fictional data only, and no prospect or client names anywhere (the pre-commit hook in section 12.2 enforces this).
- Over-promising: the Demo and Simulated badges stay visible wherever behaviour is simulated.

## 17. Sources

- Claude Code documentation: Development containers (code.claude.com/docs/en/devcontainer), How Claude remembers your project, covering CLAUDE.md and rules (code.claude.com/docs/en/memory). Also found but not read in depth: permission modes, sandbox environments, settings reference and CLI reference pages on code.claude.com.
- Everything else in this pack is derived from the product brief, Staff_Training_App_PoC_Handoff.md, and its sources.
