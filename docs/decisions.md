# Decisions

Running log of build decisions and conflicts. Newest entries at the bottom. Agents add to it; nothing here is contradicted without a new entry explaining why.

## Environment decisions by the user (23 October 2026)

These adapt build pack sections 12 and 14.1 to the isolated agent VM the build runs on.

1. **No pushing or merging by agents.** The agent team builds every milestone on the branch agent/poc-build and never pushes, uses `gh` or holds GitHub credentials. The user reviews the branch and ships it to GitHub when they choose, merging into main with a merge commit; the GitHub Pages site deploys from main. Acceptance criteria that need the live site or the user's phone are verified locally where possible and the live check goes into docs/review-checklist.md.
2. **Prospect confidentiality.** The agents are never told the first luxury prospect's name. .protected-names in the workspace holds test-only canary names so the M0 pre-commit hook can be built and tested. The real names are checked on the user's side before anything is pushed.
3. **Scope.** The full build, M0 to M7, in order, in one unattended run.
4. **Models.** Coordinator and most subagents on Sonnet; the planner and the security reviewer on Opus. When usage limits are reached, the build pauses and resumes after the reset.
5. **Permissions.** Sessions run in Claude Code auto mode inside a container on an isolated VM with an allowlisting proxy, not with --dangerously-skip-permissions.
6. **CI.** The CI job keeps the id `checks` and runs scripts/check.sh --install, because the repository's branch rules require that check. Agents may write .github workflows for this app; the user reviews them when shipping.
7. **Network.** HTTPS only through a proxy allowlist: Anthropic, GitHub, npm, PyPI, Docker Hub, Debian packages, *.gov.uk, ico.org.uk, nspcc.org.uk, and the Playwright browser download host. Other sites are blocked by design; requests for more go in docs/questions-for-user.md.

## Build decisions

### M0 assumptions (defaults chosen without being told; from docs/plans/m0.md)

1. **Seed scope for M0.** The seed builds the parts of build pack section 7 that M0's data model covers: the provider and its 5-person team and roles (7.1); all 13 clients as Client and Subscription records (7.2); sites, teams, people, user accounts and role assignments for Little Acorns, Oak Tree Nurseries and Willow Lane; nursery job roles and requirements; the evidence that produces the 7.3 statuses; Ben Carter's evidence submission; Willow Lane's 4 payment attempts. Maison Elvaro and Atelier Vasquine exist only as Client and Subscription records until M6. Later additions use their own forked RNG stream so earlier data does not change.
2. **Seed value and today.** Seed value 20261019 (placeholder from section 7). "Today" is the local date of first load, stored with the seed value in demo state. Reset demo reuses both. Tests use a fixed today of 2026-10-19T09:00:00Z.
3. **Account states not covered by brief 24.4.** Trial behaves as Active for every feature. Paused behaves as Read-only (view and export only). Deleted makes everything unavailable.
4. **Closed sign-in.** Brief 24.4 says admin sign-in is always available until deletion; brief 24.3 says only people with billing or export permission can sign in when Closed. Follow 24.3 (the more specific rule): in Closed, client sign-in requires `billing.manage` or `reports.export`; staff sign-in ends at Closed.
5. **Multi-site roll-ups in Closed** (not stated in 24.4): not available (export only).
6. **Limited drops to the floor package.** The floor (brief 20.2) has no numeric limits of its own; use the Essentials limits with every add-on off.
7. **Denies are global.** A deny on any active assignment removes that permission across all scopes (brief 22.4 "denies take precedence"). After denies, any permission whose `requires` are no longer all held is also removed.
8. **Placeholder default client roles** (brief 22.5 and 27.5). The six built-in client roles get the category levels and Allow toggles in the M0 plan table. All are placeholders.
9. **Staff read scope in M0.** A staff actor can read only their own person, user account, evidence and submissions, plus their client's record and sites. Colleagues' display names for leaderboards are added by M2 as an explicit projection.
10. **Provider and client evidence.** Provider actors cannot read evidence or submissions in M0 (brief 27.5: only via audited view-as-client mode, M4).
11. **Luxury retail on D1** is shown but disabled with "Arrives in a later build" until M6.
12. **PWA is M5.** M0 adds no PWA plugin. Version and build date show in the Demo menu now.
13. **Presenter shortcut.** Long-press of 600 ms on the Demo badge, or Shift+Alt+P (matched on `event.code === 'KeyP'`). The Demo menu also has an "Open presenter panel" item for keyboard and switch users.
14. **Default personas per surface:** staff = Jade Mills, client = Priya Shah, provider = the Owner. The Client tour sets client/Priya; the Provider tour sets provider/Owner.
15. **Base path** `/staff-training-app/` (the origin repository name), overridable with `BASE_PATH` at build time.
16. **Interface language** en-GB only in M0.
17. **`?reset=1`** (build pack 11.3) is included in M0 because Reset demo exists; it is the only URL parameter that triggers an action.
18. **Toolchain choices driven by current releases:** TypeScript stays on 6.0.x because typescript-eslint does not support TypeScript 7; React Router 8 ships as the single `react-router` package; pnpm is pinned in `packageManager` to the registry's latest.
19. **CI clean-up.** The template's Postgres service, `DATABASE_URL` and Python setup are removed from ci.yml, and `DATABASE_URL` is replaced by `BASE_PATH` in .env.example: this static app has no database or Python. The job id stays `checks` and still runs `scripts/check.sh --install`.
20. **Awaiting check with existing evidence.** Brief 27.6 says Awaiting check does not count as compliant. A person who still holds current evidence (outside the amber window) and uploads an early renewal stays `current`. Inside the amber window a pending submission shows `awaitingCheck`. Once expired the status is `overdue` with an "evidence waiting" note.

### M0 conflicts and how they were resolved

1. **Build pack 10 "deploy workflow publishes the site" and "deployed URL opens D1 on a phone"** versus CLAUDE.md (no pushing, no GitHub CLI): write deploy.yml and verify locally (`pnpm build`, `pnpm preview`, e2e at phone size); the live checks are deferred to the user via docs/review-checklist.md.
2. **Build pack 12.1 and 12.2** (non-root user, skipping permissions, token) do not apply here. Nothing in M0 touches .devcontainer or .claude.
3. **Build pack 11.1 and 4.1** describe CI steps run separately. Here CI keeps job id `checks` and runs `scripts/check.sh --install`, with setup steps before it.
4. **Brief 24.3 versus 24.4 on Closed sign-in:** see assumption 4.
5. **Pre-commit hook manual check** never prints or edits .protected-names; tests use their own canary names in temporary repositories and the manual check runs in a throwaway clone under /tmp.
6. **No real names:** canary names in tests are invented strings that do not resemble any real company or person.

### M0 chunk 1 version checks (25 October 2026, against the npm registry)

All pinned exactly (no ^ or ~), names checked against the plan's list. pnpm 12.15.0 (`packageManager`; `pnpm audit`, `--filter` and `-r exec` work as check.sh expects). typescript 6.0.3 (latest is 7.0.2, but typescript-eslint 8.72.0 requires `<6.1.0`). eslint 10.13.0, @eslint/js 10.0.1, typescript-eslint 8.72.0, eslint-plugin-react-hooks 7.1.1, globals 17.13.0, prettier 3.9.10. vitest 5.0.5, jsdom 30.1.3, fake-indexeddb 6.2.6, @playwright/test 1.64.1. vite 8.3.5, tailwindcss and @tailwindcss/vite 4.3.3, @vitejs/plugin-react 6.1.2 (peer vite ^8). react and react-dom 19.3.1 (React Router 8.5.0 needs 19.2.7 or later), @types/react and @types/react-dom 19.3.0, @types/node 24.19.2 (Node 24). zod 4.6.7, idb 8.0.4, @tanstack/react-query 5.104.5. Testing Library packages and @axe-core/playwright (4.14.0) are added by the chunk that first uses them.

### Tooling notes (chunk 1)

- In this container, corepack's pnpm shim needs `NODE_USE_ENV_PROXY=1` to reach the registry through the proxy (otherwise `pnpm` fails with EAI_AGAIN).
- Type-aware ESLint uses the TypeScript project service. The lint-rules test lints virtual files, so `eslint.config.js` lists the virtual test paths (those that do not yet exist on disk) under `allowDefaultProject`. A new virtual file name used in that test must be added to `virtualNames` there.
- Prettier ignores `*.md` and `.github` (hand-written, user-reviewed) and protected files.

### M0 chunk 3: domain core and schema choices

Choices made by the test-writer where build pack section 6 left things open, accepted by the implementer:

- **PaymentAttempt gains `id` and `clientId`.** Build pack 6 has only `invoiceId`; the data layer needs a key and the tenant.
- **Ids** are upper-case Crockford base32, 26 characters (the output of `ulid()`): no I, L, O or U, no lower case.
- **`isoDateSchema`** needs a full date-time with `Z` or an offset, and a real calendar day.
- **ClientSettings** fields all have defaults, so `clientSettingsSchema.parse({})` works (amberWindowDays 60, allowSelfApproval false, defaultLanguage en-GB, battles all on with maxRoomSize 20; reminder and retention values are placeholders).
- **`clientId` is required** on Site, Team, Person, Evidence, EvidenceSubmission, Subscription, AddOnSubscription and PaymentAttempt. UserAccount needs it unless side is `provider`.
- **IndustryPack** `defaultCategoryIds`, `defaultRules`, `faqIds` and `supportFeatureIds` default to `[]`; `defaultRules` is an opaque record list until auto-assign rules arrive.
- **Dates**: `addDays` and `addMonths` keep London wall-clock time; months clamp; `daysBetween` compares London calendar dates; in the repeated 01:xx hour the earlier instant is used.
- **RNG**: sfc32 seeded from a string hash of the lineage (`seed:<n>` then `/<labelLength>:<label>` per fork), so a fork depends only on seed and labels.
- **Test edit (not a weakening):** `ids.test.ts` used `[...prefix]` on a string, which `@typescript-eslint/no-misused-spread` rejects; changed to `Array.from(prefix)`, same behaviour and assertion.

### M0 chunk 4: permission engine choices

- **Group Admin and `org.editName` (open point).** The plan table gives Group Admin settingsBilling `view` and "every Allow except `team.manageRoles` and `billing.manage`". The plan also says an Allow whose category is below the level it needs is dropped, and brief 22.5 treats the organisation name as a settings change. So `org.editName` needs settingsBilling `manage` and Group Admin loses it. This matches the plan summary ("manages everything except settings and billing (view only)"), so the test is right and was not changed; the plan's wording "every Allow except" means every Allow the levels permit.
- **Category mapping.** staff, assigning, modules, competitions, themes, reminders and settingsBilling give `<area>.view` at view and add `<area>.manage` at manage (settingsBilling uses `settings.*`). evidence and reports give only `evidence.view` and `reports.view` at either level (the rest are Allows). feedbackHelp gives `support.raise` and `moduleFeedback.view`.
- **Level each Allow needs.** `staff.delete` and `team.manageRoles`: staff manage. `evidence.uploadForOthers`, `evidence.approve`, `modules.addLinks`: their category at manage. `reports.export`, `battles.host` (competitions), `billing.view`, `support.viewOrgTickets`: view. `billing.manage`, `org.editName`: settingsBilling manage. `support.allowStaffTickets`, `moduleFeedback.respond`: feedbackHelp manage.
- **Catalogue requirements.** Each `.manage` requires its `.view`; extras such as `staff.delete` needs `staff.manage`, `org.editName` needs `settings.manage`, `battles.host` needs `competitions.view`. `team.manageRoles` and provider `roles.manage` require nothing (a provider role holding `roles.manage` without `team.read` still works). Provider system roles live in `catalogue.ts` as `providerRoleTemplates`, closed under requirements.
- **`own` scope** is bound to the user inside `effectivePermissions` (`{ type: 'own', userId }`), so `can()` needs no user id. Dependency pruning checks that a required permission is held at all, not at the same scope.
- **`canGrant` and sites.** A whole-client holder can grant on named sites only when the caller passes the optional fourth argument `clientId` (sites do not carry their client in the scope); otherwise it fails closed. Empty id lists are refused. Unknown permission ids are refused.
- **Owner role recognition.** A role is an owner role when `system` is true and it is named `Owner` with provider ownership, or `Account Owner` with a client owner. Owners are grouped per provider and per client; a change is refused if any group with active owners would be left with none. `canApproveEvidence` takes `isAccountOwner` from the caller.
- **Change shapes** for `lastOwnerGuard`: `removeAssignment`, `removeRole`, `suspend`, `setExpiry` (with `expiresAt`) and `deleteUser`, each with the ids shown in the tests.
- **`canApproveEvidence` reasons.** `outOfScope` when the actor holds `evidence.approve` somewhere but not for this client or site, `noPermission` when they never hold it; `ownUpload` is checked before `aboutSelf`.
- **Test edit (not a weakening):** the `id()` helper in `engine.test.ts` built ids from readable tags such as `CLIENT1` and `RIVERSIDE`, which contain I, L, O or U and fail the chunk 3 Crockford id schema. It now maps those letters to valid ones (I and L to 1, O to 0, U to V). No assertion changed.

## M0 chunk 5: entitlements, account states, packs, requirement status

- **stateSince for stored limited, readOnly and closed states is the start of that state, not dunning day 0.** Only pastDue uses stateSince as day 0. For the others the dunning day is the first day of that state (graceDays+1, limitedUntilDay+1, readOnlyUntilDay+1) plus London days since stateSince. Reason: build pack 6 names the field "since", the UI shows "Limited since ...", and a state entered by an admin or provider action has no pastDue day 0 to point at. Covered by accountStateSince.test.ts.
- Grace extension only applies to a stored pastDue state. At or after graceExtendedUntil the normal day boundaries apply.
- A trial with no nextStateAt never ends. Trial end-path days (14 read-only, 30 closed) are fixed constants from brief 24.3, not part of DunningPolicy.
- requirementStatus filters evidence and submissions by requirementId only; callers pass one person's records. The amber window is measured in London calendar days (addDays), so DST does not move the boundary.
- entitled() treats a flag name as true, and never reads the `flags` key itself as a feature.

## M0 chunk 6: content package

- **Renewal periods stay VERIFY.** Safeguarding 24 months, paediatric first aid 36 months and food hygiene 36 months are placeholders. No official source was fetched in this session (no fetch tool), so each is marked `VERIFY` in `packs/nursery.ts` and should be checked against the EYFS statutory framework, DfE and HSE/FSA pages.
- **Stable content ids.** `packs/contentId.ts` builds fixed ULID-shaped ids (`01M0C0N7` plus a zero-padded number) so packs, modules, packages and add-ons keep the same ids across runs. Ranges: packs 1xx, modules 2xx, packages 3xx, add-ons 4xx, job roles 5xx, requirements 6xx.
- **Entitlement values not in the brief.** `customClientRoles` is 0 (Essentials), 3 (Standard, Core) and unlimited (Group); `perSiteThemes` is true for Group only; response targets are 48, 24 and 4 hours (Group "same working day") as targets, not guarantees. All placeholders.
- **Add-ons use flags.** Each add-on adds a named flag (for example `aiAssistant`, `translation`) read through `entitled()`. AI Assistant and reminders are usage-priced; the others are flat. Prices are placeholders in pence.
- **Strict mode in `createT`** defaults to on unless Vite's `MODE` is `production`, read through a cast of `import.meta` so packages/content needs no Vite types.
- **Tooling.** packages/content tsconfig now includes `node` types because the chunk 6 tests read files with `node:fs`.
- **Test edit (not a weakening):** `i18n.test.ts` called `createT(enGB as never)`, which lint rejects as an unnecessary assertion because the real file already matches `Messages`. The cast was removed; the assertion is unchanged. The other `as never` casts are on test messages and remain.

## M0 chunk 7: data layer and contract suite

- **One policy, two adapters.** `createStore(backend, options)` holds validation, tenancy, permissions, audit, account state and entitlements. An adapter only implements `RawBackend` (`getAll`, `get`, `apply` for an atomic batch, `clear`, with copies in and out). The memory adapter is `createMemoryStore`; the IndexedDB adapter (chunk 9) implements the same interface. The suite is exported as `@sta/data/contract` (and the fixture as `@sta/data/contract/fixture`) so the IndexedDB test reuses it. The suite stays adapter-agnostic.
- **Staff in a Closed account.** `staffOwnRecord` is `no` for Closed, so every staff call throws `AccountStateError(closed, 'staffOwnRecord')`. Client admins in Closed can still read and export (`coreCompliance` is `exportOnly`). In Deleted everyone but the provider gets `AccountStateError`.
- **Account state for writes.** Creating a person, user or role is `authoring` (refused in Limited, Read-only, Paused, Closed). Every other client-side write needs `coreCompliance` to be `yes`. The check comes after permission and role rules, as the plan orders it. The state is read from the client record, not recomputed from the subscription timeline.
- **Pack-level requirements and job roles are readable by every known actor** (they have no clientId); packages and add-ons (the catalogue) need `billing.view` for a client admin and are never readable by staff. Writing a global record is `ForbiddenError('permission')`, not `tenant`.
- **Outbox append is open to any known, active actor.** It is validated, append-only, and has no read path except `DemoAdmin.listOutbox()`. Audit append requires `actorId` and `actorSide` to match the caller and `clientId` to be the caller's own (providers may omit it).
- **Custom role counting.** Only non-system roles owned by the client count towards `customClientRoles`; the limit comes from `entitlements()` with the client's package plus add-ons whose subscription is `on` or `trial`. Updating an existing role is never limited. The "floor package" for non-full states is the package with the lowest first-band price (the data layer has no pack config).
- **`ForbiddenError.reason` is `'permission'`, the domain result is `'noPermission'`.** The data layer maps `noPermission` to `permission` so callers see one word; `ownUpload`, `aboutSelf` and `outOfScope` pass through.
- **Role rule details.** Escalation checks only permissions that are new on the role or assignment (same scope), so suspending someone is judged by `lastOwnerGuard`, not by what the granter lacks. Client actors cannot write system roles. Assignments must use roles of the same tenant as the user and a scope inside that client.
- **Approval.** Moving a submission to `approved` runs `canApproveEvidence` on the stored submission's identity fields, then writes the submission (reviewer and time from the context), the Evidence (`approvedBy`, `approvedAt` from `ctx.now`) and an `evidence.approved` audit event in one batch. `adminCount` is the number of client-side users with an active assignment.
- **Audit ordering.** Lists are sorted by id, except audit, which is sorted by `at` then id so ULID randomness within one millisecond cannot reorder events.
- **No `settings` repository on DataStore.** The `settings` store holds SeedMeta and DemoState and is reachable only through `DemoAdmin`; it appears in `dumpAll`.
- **Direct Evidence puts** are refused for every side (superseded by M0 security fixes below): Evidence is written only by the approval flow and by seed loading through `DemoAdmin.bulkPut`. Module-completion evidence written by staff arrives with M2 and will add its own explicit rule.
- **Lint.** `no-non-null-assertion` is off for `packages/data/src/contract/**` (test code in non-`.test` files so adapters can import it).

## M0 chunk 8: seed generator
- **Shape.** `packages/seed/src/world.ts` builds the whole M0 world as pure data (`buildWorld`); `load` clears the store and writes it through `bulkPut`; `seedKeys` returns the same keys without a store; `reset` reloads from the stored SeedMeta (default seed value 20261019 and a fixed default date when nothing is stored) and only touches DemoState if one exists (clock offset to 0, industry and persona kept).
- **RNG.** Seven root forks (`provider`, `clients`, `littleAcorns`, `oakTree`, `willowLane`, `evidence`, `billing`), never drawn from the root. Ids are ULIDs from a fixed clock at `today` plus the section's stream. Content ids (packs, requirements, job roles, packages) stay the fixed content ids.
- **Names.** Section 7 only names the Little Acorns people, so Oak Tree (15) and Willow Lane (8) people are invented fictional names. The plan's name allowlist test (chunk 9 content tests) must include them.
- **Kasia's second language** is `pl-PL`. Only `en-GB` exists in the language files today, so the app falls back to English until a second file is added; the pref is only data.
- **Account states.** Day counts follow the default dunning policy used by the tests (grace 14, limited to 30, read-only to 60, closed to 150): Sunny Days `stateSince` is 5 days ago (timeline day 20), Little Stars 9 days ago (day 40), Meadowview 50 days ago (deletion in 40 days), Willow Lane 10 days ago. Trials store `nextStateAt` 18 and 25 days ahead.
- **Roles.** Every client with people gets all six system client roles. Oak Tree has no Account Owner in the seed (the spec lists a Group Admin and Site Managers); the contract suite adds one as a test record. The custom provider role Account manager is unassigned and uses `clients.read`, `tickets.read` and `tickets.write` (there is no support-reports permission yet).
- **Oak Tree and Willow Lane evidence** is thinned per site to the stated compliance level (95, 80 and 55 per cent; Willow Lane 85) with the `evidence` stream; Little Acorns evidence is exact (7.3).
- **Contract suite.** The hand-built fixture is gone. `contract/world.ts` loads the seed, then adds test-only records through DemoAdmin: a second Little Acorns setting (Annexe) and Mia, Rory (team.manageRoles but no billing), a Billing viewer role, Tim (assignment expiring the next day), Sue (suspended), three extra submissions (by Daniel, about Daniel, at the Annexe), an Oak Tree Account Owner, one test add-on, and owner and staff people for the Read-only, Closed and Paused seed clients plus a Deleted client. `@sta/data` has `@sta/seed` and `@sta/content` as dev dependencies; `@sta/seed` only imports types from `@sta/data`, so there is no runtime cycle.
- **Test corrections.** `fastForward.test.ts` used `U` in an id (not a Crockford character) and compared `offsetClock` (exact milliseconds) with `addDays` (London wall time) across the 25 October clock change; both fixed.

## M0 chunk 9: IndexedDB adapter

- **Signature differs from the plan; the tests' version is kept.** The plan said `createIndexedDbStore(dbName)`. The tests need `createIndexedDbBackend(dbName)` and `createIndexedDbStore(options, dbName)`, both with `close()`. Plan text fixed.
- **Keys.** Object stores use out-of-line string keys from `keyOf`, so the composite key for add-on subscriptions is the string `clientId:addOnId` (not an array key). One `clientId` index on every store whose records carry it.
- **Atomic apply.** Store names are checked before the transaction opens, then all puts and deletes run in one readwrite transaction that is aborted on any error.
- **Contract suite fix.** Two tests built an array of promises up front and awaited them one by one. With a truly async backend the later ones rejected before being awaited, giving unhandled rejections. They now build thunks and call them in turn. Assertions unchanged.
- **Test typing.** persistence.test.ts needed type-only fixes for strict lint and typecheck (node types for packages/data, domain types instead of any, guards instead of non-null assertions). Assertions unchanged.

## M0 chunk 10
- tokens.test.ts reads tokens.css with `new URL(import.meta.url)`, which fails under the jsdom project (non-file URL). Added a `// @vitest-environment node` docblock to that file only; assertions unchanged.
- Dialog handles Escape in both a keydown handler and the native `cancel` event (both call onClose; the parent controls `open`). It focuses the first focusable child on open, because jsdom's showModal stand-in does not move focus, and restores focus to the opener when `open` becomes false.
- StatusBadge covers six statuses with five status colours: notStarted shares the overdue colour but has its own icon (x-circle) and label.
- Dark values are duplicated in `[data-colour-mode='dark']` and in the `:root:not([data-colour-mode])` media rule so the explicit attribute always wins.
- Remaining small components (Card, Badge, VisuallyHidden, PageHeader, SideNav, MoreSheet) are in components/Layout.tsx. tailwind.css is not imported by any test; the web app will import it in chunk 11.

## M0 chunk 11

- Seed user `displayName` is now the full name (for example "Jade Mills"). It was the first name only; the shell tests and the plan ("Jade Mills (staff), Priya Shah (client)") need the full name.
- `PageHeader` in packages/ui renders a `div`, not `header`, so a page heading inside `main` is not a second banner landmark.
- `BottomTabBar` gained an optional `more` prop (the More button as the last item) and tab labels wrap inside narrow tabs, so five tabs fit at 390 px with 200% text.
- `@sta/ui` lists `tailwindcss` as a devDependency (same pinned version) so `tailwind.css` can resolve `@import 'tailwindcss'`.
- The CSP meta tag is added by editing the HTML string, because Vite's tag descriptors escape quotes to `&#39;`.
- The staff shell renders one navigation (bottom bar on phones, sidebar from 48rem); client and provider shells render both with CSS, so the More items are always in the DOM. Plain `#/` links are routed through the router by a click handler on the shell.
- D1, D3 and the Demo badge are minimal in this chunk; chunk 12 completes them.

## M0 chunk 12
- The Demo badge is rendered once by a root layout route (`apps/web/src/demo/RootLayout.tsx`) in a strip above every screen, not in each shell header. The Demo menu and presenter panel live there too. The route error screen sits outside it.
- Reset demo rebuilds the data in place, clears the offset and invalidates loaded queries, with no page reload. A reload raced with the end-to-end test, which opens the panel straight after confirming.
- A Shift+Alt+P press that lands before the app has mounted (IndexedDB is still opening) is remembered by `demo/earlyShortcut.ts` and opens the panel on mount.
- The root layout renders the badge once; a shell header that has a `DemoBadgeSlot` receives it through a portal (the navigation e2e test expects the badge inside the banner), other screens get a strip. Reset demo no longer reloads (see above).
- Dialog content renders only while the dialog is open, so closed dialogs add nothing to the page (and the build constants are only read when the menu is open).
- `demo.outboxEmpty` and `demo.resetConfirmTitle` text changed to what the tests require. No test was changed.

## M0 chunk 13
- Local deploy check: `pnpm build && pnpm preview --host 0.0.0.0` (25 October 2026). `/staff-training-app/` returned 200 with index.html whose script and stylesheet URLs start with `/staff-training-app/assets/`; the hashed JS asset returned 200 as `text/javascript`; `/` redirected (302) to the base path. Routing is hash based (`#/staff` and so on), so the server needs no fallback rules. The preview server was stopped afterwards.
- deploy.yml uses `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5` and `actions/deploy-pages@v5`, with checkout and setup-node at v7 as in ci.yml. VERIFY: the sandbox cannot reach the actions' releases pages, so these major tags come from the plan and are unconfirmed. Dependabot (github-actions, now also npm) will propose corrections. Listed in docs/review-checklist.md.
- `.env.example` already carried `BASE_PATH` from an earlier chunk.

## M0 security fixes

- **Evidence is approval-only.** `store.evidence.put` is `ForbiddenError('permission')` for client, staff and provider alike (a client Owner included), so `canApproveEvidence` and the audit event cannot be skipped. There is no evidence remove. Seed writes through `DemoAdmin.bulkPut` are unaffected. M2 module-completion evidence will get its own explicit rule.
- **Submission writes tightened.** An approved submission can never be changed. Scope is checked against the stored site and the new site. Staff may only create their own submission (awaitingCheck, no reviewer, decision or evidence fields) or move their own awaitingCheck submission to withdrawn with nothing else changed. Any other status change (rejected, needsBetterCopy, withdrawn by an admin) needs `evidence.approve`, takes `reviewerId` and `reviewedAt` from the context, and writes an audit event (`evidence.<status>`). Changing decision fields without `evidence.approve` is refused; `uploadForOthers` can only create waiting submissions.
- **User sides.** The user schema refuses side `provider` with a clientId. Client-side user writes are refused if the record is, or becomes, a provider user, or if the side changes.
- **Slim evidence audit.** Evidence approval and decision events store only `{ submissionId, status, evidenceId }`, never personId, fileAttachmentId or decisionNote, so the provider's audit view exposes no submission content.
- **Audit time.** `audit.append` sets `at` to the context time for non-provider actors; only providers may supply their own.
- **Protected names override.** `scripts/protected-names.mjs` honours `PROTECTED_NAMES_FILE` only when `NODE_ENV=test`.
- **CSP limits.** The meta-tag Content-Security-Policy cannot set `frame-ancestors` (browsers ignore it in a meta tag) and keeps `style-src 'unsafe-inline'`. Real framing protection needs a response header on the host, which GitHub Pages does not allow; noted for the live review.

## M1 assumptions (from docs/plans/m1.md)

Assumptions
1. Jade starts with Safeguarding evidence 18 months old plus an open assignment (due in 14 days), so her ring turns green on passing.
2. C1 needs-attention lists active and on-leave people only: overdue, then expiring soon, then not started; awaiting check is a separate section (Ben).
3. Compliant means current or expiringSoon; staff "to do" counts overdue, not started, expiring soon and open assignments not already counted.
4. Next up is the earliest open assignment, else the most urgent requirement with a published module; Coming up shows the next three dates within 90 days (superseded in part: see "2026-10-25: Coming up fills past 90 days" below, which fills from later dates when fewer than three fall inside the window).
5. Quiz unlocks once every lesson of the current version is completed; maxRetakes null is unlimited; an unfinished attempt is resumed.
6. Scenario is correct only if every choice on the path is best; outcome is the worst on the path; score is percent correct rounded down.
7. Draw rules: mcq, scenario and mix pools, mixScenarioShare, shortfall fills from the other type, shuffle flags; true or false options never shuffled.
8. Learn more shows all links after a wrong answer, only all-showFor links on a right answer when learnMoreFor is all; official first, then organisation; closed-book hides until results.
9. Link display domain: gov.uk for .gov.uk, last three labels for two-part UK suffixes, else last two; organisation documents show the client name.
10. The organisation policy is an Attachment with a short fictional Markdown body at `#/doc/:attachmentId`, not a real PDF (real uploads are M3).
11. Every published provider module is visible to every client in M1; pack-based visibility arrives in M6 (known gap).
12. Lesson, block, question, option, step and choice ids are module-local keys (`^[a-z0-9][a-z0-9-]{0,39}$`), not ULIDs.
13. Notifications store kind plus params and carry clientId, replacing build pack 6's literal title and body.
14. Assigning is one all-or-nothing batch; duplicates are skipped; due date is end of London day, today or later; at most 500 people; one Notification each; no Outbox.
15. Passing writes module Evidence per applicable requirement, marks assignments done and appends events and a slim audit in one batch; failing writes only the attempt and event.
16. Live update: the store emits store-name-only change notices; the web app invalidates queries and relays on BroadcastChannel('sta-data').
17. S1 lists active staff users via `DemoAdmin.listStaffUsers`; demo PIN is 1234.
18. Modules carry optional `draftContent`; Safeguarding ships as draft with a "Draft content" badge.
19. SeedMeta gains `seedVersion` (2); an older stored seed reloads with the same seed and today; IndexedDB schema goes to version 2.
20. Client admins with reports.view read learning events and attempts in scope; staff read only their own; provider reads none in M1.
21. Safeguarding quiz settings are placeholders: mix, share 0.4, draw 10, shuffle on, pass mark 80, unlimited retakes, feedback on.
22. Renewal periods stay VERIFY; Safeguarding refresher keeps the placeholder 24 months.

Conflicts and resolutions
1. Module-completion evidence arrives in M1, not M2: `learning.finishAttempt` is the only staff path writing Evidence; direct `evidence.put` stays forbidden.
2. Section 7.3 has Jade current but Track A needs a visible change: resolved by Assumption 1.
3. Track A celebration and "You're 2nd of 13" are out of scope (M2): M1 shows a plain "You passed" panel and the ring change.
4. Build pack 6 Notification lacks clientId and stores literal text: Assumption 13.
5. Section 7.4 "fictional PDF" becomes an Attachment: Assumption 10. Also: pack 6 `Id` typing for question and option ids becomes module-local keys (Assumption 12); C1 versus Ben's awaiting-check status (Assumption 2); module files live under `packages/content/src/packs/nursery/modules/<key>/`; random draws use the injected, forked RNG with a pinned browser clock in e2e.

M0 known issues fixed in M1 chunk 1: owner roles are recognised by a `systemKey` on system roles (never by name), `isAssignmentActive` is shared by the engine and policy, and the single-admin count now counts only active users with an active, unexpired assignment (contract tests cover suspended and expired second admins).

M1 chunk 3 addition to Assumptions 2 and 3: a new starter (start date within the last 14 days, `NEW_STARTER_DAYS` in packages/domain/src/progress/client.ts) is in induction, so their not-started requirements are left out of Needs attention and do not make them non-compliant on C1. Reason: build pack 7.3 gives Sam Okafor (started 10 days ago) no evidence, yet C1 must list exactly six items and show 11 of 14. Overdue, expiring and awaiting-check states still count for new starters. The staff ring still shows their requirements as to do.

M1 chunk 4: Safeguarding content
- Source: EYFS statutory framework for group and school-based providers, from September 2026. URL taken from the GOV.UK publication page (https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2), not from the search result. Cached in .sources-cache/eyfs-group.txt. Paragraph numbers (3.4, 3.6 to 3.12, 3.17, 3.31 to 3.33) and printed page numbers (23 to 26, 29) were checked against that text. Links use `#page=N` on the PDF.
- Renewal: EYFS 3.33 says safeguarding training "must be renewed every two years", which matches the 24-month placeholder. Per the user instruction the requirement value and its VERIFY marker are unchanged.
- The NSPCC whistleblowing advice line page (nspcc.org.uk) returned a bot-check page (HTTP 403) from the build environment, so the URL in the question bank is from memory and is listed in module.json `verify` and docs/review-checklist.md. The advice line number and hours in lesson 3 are not included; the lesson only names the line, so nothing goes stale.
- The module is a folder (module.json plus lesson-N.md). `nurseryModules` in packages/content/src/packs/nursery/modules/index.ts parses lessons with `parseLesson` and validates the result with `moduleSchema` at load. It imports lessons with Vite's `?raw`, so it works in Vite and Vitest only (chunk 5 should load it from the app or seed through Vite/Vitest, or copy the parsed result).
- Scenario choices that are not best also lead to the next step, so a learner who picks a weaker choice still sees the whole scenario. Link titles are descriptive; EYFS links carry the paragraph and page in `locator`.
- Scenario names (Maya, Leo, Alfie) are fictional first names only.

## 2026-10-25: Coming up fills past 90 days (M1 chunk 8)
Plan M1 Assumption 4 limits Coming up to dates within 90 days, but the seeded Jade has only one date inside that window (her refresher due in 14 days; her other expiries are 6 months or more away) while plan F-4 and the committed tests expect three. Brief 16.2 says the strip shows "the next three dates", so the domain now returns the next three future dates, soonest first. Dates inside 90 days always come first (the list is date ordered); later dates only fill the strip when fewer than three are inside the window. Seed data is unchanged.

## 2026-10-25: M1 review decisions
- axe-core 4.14.0 is a devDependency of packages/ui so component tests can run axe directly. The package name and version were checked against the npm registry; it was already in pnpm-lock.yaml through @axe-core/playwright. Pinned exactly.
- `attachments` is organisation-documents-only in M1 (policies such as the Little Acorns Safeguarding policy, readable by every person in the client). Before any per-person evidence file is stored in it (M2 or M3), add per-person record rules (owner, site manager and permission checks) and contract tests; do not reuse the current client-wide read rule for personal files.
- The static app ships the module banks to the browser, so a staff member can read answer keys in dev tools. This is accepted for the demo; the production item is in docs/review-checklist.md.
- NEW_STARTER_DAYS (14) is a default chosen without being told; it is pinned by a boundary test (day 14 is still induction, day 15 is not) and listed as VERIFY in docs/review-checklist.md.
- The CSV formula guard also covers a leading tab or carriage return.
- e2e needs pdftotext and pdfinfo (poppler-utils) for the matrix PDF checks. CI installs it before check.sh.

## M2 assumptions (from docs/plans/m2.md)

Every number marked placeholder is engine config in packages/domain (`engagementConfig`), not hard-coded in the UI. Numbering matches the plan.

### Assumptions: XP, levels, badges and weekly goal

1. **XP is derived, never stored.** `xpLedger(...)` folds `xpForEvent` over a person's learning events in order (`at`, then `id`) and returns `XpEntry[]` (build pack 4.3: "XP ... computed from events"). There is no XP or badge store and no `badgeEarned` event; the ledger's `sourceEventId` keeps each award unique. Staff compute their own XP in the app from their own events; nobody else's XP is ever shown.
2. **XP table (placeholders):** first completion of a lesson (per module and lesson key) 10, repeat 0; first correct answer to a question (per module and question key, any attempt, open or closed) 10, any later correct answer to it 0; closed-book bonus on that first correct answer when the answer was given with notes hidden: `round(10 x (1.5 - 1))` = 5, as its own `closedBookBonus` entry; first pass of a module version 20, a later pass of the same version 0, a pass of a newer version of a module passed before 10 (reduced); mastery of a module (every question in its current bank has had a credited correct answer) 30, once per module; early refresher (a pass that creates Evidence for a requirement whose previous Evidence had not yet expired) 25; weekly goal met 15, once per week. XpEntry `kind` gains `passed`. Wrong answers, attempt duration, answer timing and number of attempts never earn or lose XP.
3. **Daily cap** 300 XP per London calendar day (placeholder). Entries are applied in order; the entry that crosses the cap is reduced to the remainder; later entries that day stay in the ledger with amount 0 and `capped: true`, so S8 can say "Daily XP limit reached". The next London day starts at 0 (DST-safe, via `daysBetween`).
4. **Closed-book bonus per question (brief 18.3).** Each `questionAnswered` event stores `notesVisible`. The UI sets it true if the notes panel was open at any moment while that question was on screen; in a closed-book attempt it is always false (the data layer refuses true). A question answered with notes visible never gets the bonus, other questions in the same attempt keep theirs.
5. **Levels (placeholders):** thresholds 0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, then +800 per level. `levelFor(totalXp, thresholds)` returns `{ level, xpIntoLevel, xpForNext }`. Thresholds and badge definitions live in packages/content (`engagement/levels.json`, `engagement/badges.json`); rules live in domain.
6. **Badges** (derived by `earnedBadges(...)`, each with the instant it was earned): First module (first `moduleCompleted`); Safeguarding Ready (passed the module that satisfies the pack's Safeguarding requirement); Mastery, one per module (assumption 2's mastery moment); Early Bird (first early refresher); Scenario Savvy (10 different scenario questions answered with the best outcome, placeholder); Learning Habit (4 active learning weeks in total); All Compliant (at the instant of some Evidence `completedAt`, every applicable requirement was current or expiring soon given Evidence completed up to then; assignments are ignored for this badge); Competition winner (named in any competition's recorded winners). Battle Room badges are M7. None depends on speed.
7. **Weekly goal.** Weeks are London weeks starting Monday. Goal: `ClientSettings.weeklyGoalLessons` (new field, default 1; admin UI in M3 C24). A week is active when the person has at least one `lessonCompleted` or `attemptFinished`. Goal met when `lessonCompleted` events in the week reach the goal. Total active weeks never resets. The current run counts consecutive active weeks ending this week or last week, skipping rest weeks (weeks the person is on leave: `status: 'onLeave'` for the current week, `pausedUntil` for weeks before it); a rest week neither breaks nor extends the run. The output type has no "lost" or "broken" state, and the UI never shows red for it.

### Assumptions: Leaderboards and competitions

8. **Who is ranked.** People with `status: 'active'` in the board's scope (on leave, invited and archived people are never ranked or counted). People with `prefs.hideFromLeaderboards` are left out of every ranking, every "of N" count and every winner announcement seen by anyone else, including admins' leaderboard views. Little Acorns therefore has 13 ranked people (14 active or on leave, minus Grace on leave), which gives Track A's "You're 2nd of 13".
9. **Ranking.** Standard competition ranking with shared ties (1, 2, 2, 4); within a tie, rows are ordered by display name, never by who got there first. Rows shown are those with value above 0 and rank 10 or better (more than 10 rows only when tied at 10th). The viewer always sees their own row privately: rank and "of N" when value is above 0, otherwise "Not on the board yet" with how to join; `toNext` = value of the next better rank minus the viewer's value (null at rank 1). A hidden viewer sees their own position computed as if they were included, labelled "Only you can see this". Display name is the nickname if set, else first name plus last initial ("Jade M."). XP is never an input to any ranking function.
10. **Standing boards (M2: My site scope only).** Most questions answered correctly (unique, per module and question key); Most modules completed (published modules, once per module, new versions do not count again); Most modules mastered; Most active learning weeks; Refresher Champions (passes or approved external Evidence completed before the previous Evidence for that requirement expired); Team board (per team, percentage of assignments due in the period completed by their due date, team level only, teams with no assignments due are listed as "No training due"). Each has All time and This month (London calendar month) except the Team board, which has This month and This quarter. Region, country and all-sites scopes and the Sites board are M3 (their AC is in M3).
11. **The S7 and S10 headline position** ("You're 2nd of 13") uses Most questions answered correctly, All time, My site.
12. **Competition status is derived.** Stored status is `draft`, `scheduled` or `cancelled`; `competitionStatus(c, now)` returns draft or cancelled when stored so, otherwise scheduled before `startAt`, live from `startAt` until `endAt`, ended from `endAt`. So Fast-forward moves competitions on.
13. **Template metrics** (`competitionMetric(template, input)`; only events with `at` in `[startAt, endAt)` count; eligible people only; `moduleIds` restricts to those modules when set, else all modules):
    - masteryMonth: modules for which every question in the current bank was answered correctly at least once within the window (retakes allowed).
    - knowledgeBuilder: unique questions answered correctly within the window.
    - learningStreak: active London weeks (assumption 7) within the window.
    - teamShowdown: per team (or per site when `teamUnit: 'site'`), percentage (rounded down) of eligible people's assignments due within the window that were completed (a `moduleCompleted` for that module by that person) at or before their due date; units with none due are not ranked.
    - beatTheExpiry: qualifies when, within the window, the person has Evidence (module or approved external, by `completedAt`) for a requirement with a renewal period and the previous Evidence for that requirement had not expired at that time.
    - completeAndWin: qualifies when every module in `moduleIds` (required for this template) has a `moduleCompleted` within the window.
    - scenarioSavvy: unique scenario questions answered with the best outcome (correct) within the window.
    - closedBookChallenge: unique questions answered correctly in closed-book attempts within the window (closed-book only is forced on).
    `closedBookOnly` is allowed on masteryMonth, knowledgeBuilder, scenarioSavvy and closedBookChallenge; when on, only answers from attempts whose stored `mode` is `closed` count (the attempt record, not the event flag, decides).
14. **Eligibility.** All active people of the client, narrowed by `jobRoleIds`, `teamIds` and `siteIds` when set (a person matches a list if any of theirs is in it), minus `excludePersonIds`. People on leave are never eligible. Ineligible staff still see the competition and its details with a short note.
15. **Winners.** `top`: the people (or teams) at rank 1 to `winnerCount` from the final standings, including everyone tied at the last place; `draw`: `drawWinners(qualifiers, count, rng.fork(competitionId))`, where qualifiers are people with value above 0 for metric templates or who qualify for beatTheExpiry and completeAndWin; hidden people are included in draws but excluded from top rankings; `teamTarget`: every team at or above `teamTarget` per cent (new field, default 90). Winners are recorded from the competition's end onwards, once. Staff see winners by display name; a hidden winner shows as "A colleague". Admins see names (they hand over prizes offline).
16. **Builder rules** (`validateCompetition(before, after, now)`): end after start; built-in needs a template and winner selection; custom has no template, metric, leaderboard, winner selection or closed-book option; name 1 to 80 characters; description up to 500; prize text 1 to 120 characters to publish (drafts may be empty); once started, template, `closedBookOnly`, `moduleIds`, `teamUnit` and eligibility cannot change and the end can only move later; cancelling is allowed until the end; a cancelled or ended competition cannot be edited. Publishing needs `newCompetitions` account availability, `checkLimit(entitlements, liveOrScheduledCount, 'liveCompetitions')` (custom and built-in both count), and `entitled(entitlements, 'closedBookCompetitions')` when closed-book only is on.
17. **Live leaderboard toggle off** hides rows from staff until the end (they still see their own progress); admins always see rows. Custom competitions never have leaderboards.
18. **Prize generator.** `nextSuggestion(list, state, rng)` walks a shuffled permutation of the active pack's list and reshuffles at the end so the first of the new cycle is never the last of the old one; never the same text twice in a row, every suggestion appears once per cycle. The UI uses the app's injected RNG (forked by `prize:<builder session>`). The active pack is the client's `industryPackId`. Nursery list: the 20 suggestions in brief 13.3, stored as `packages/content/src/packs/nursery/prizes.json`.
19. **Closed-book choice.** Offered before the first question when a live competition with `closedBookOnly` is one the person is eligible for and covers the module. Otherwise the attempt is open with notes hidden by default. Modules with `quiz.notesInQuiz: 'closedBookOnly'` always start closed (no choice, no notes control, short explanation). The mode is fixed for the attempt; resuming keeps it.
20. **Closed-book enforcement is in the data layer.** While the person has an unfinished closed attempt: `notes.list` and `notes.get` throw `RuleError('notesLocked')`, `answer` with `notesVisible: true` throws `notesLocked`, and `learnMoreOpened` throws `RuleError('closedBook')`. The UI shows a locked indicator and renders no notes and no Learn more links in feedback. After the attempt ends, results show every missed question's links. `learning.abandonAttempt(ctx, attemptId)` ("Leave this attempt") ends an unfinished attempt with `abandoned: true` and no score, so nobody is locked out of their notes; abandoned attempts do not count towards `maxRetakes` and do not count for competitions.

### Assumptions: Notes

21. **Notes are private to the learner** (brief 18.1): only the staff user whose person owns the note can list, read, write or delete it; every other actor (client admins of any level, provider, other staff) gets NotFound on get and an empty list or Forbidden on list. No audit event and no `noteCreated` learning event is written (an event would tell managers that a note exists). `DemoAdmin.dumpAll` still includes notes (demo shell and tests only). Notes have `clientId` and `personId`, no site.
22. **Note rules:** body trimmed, 1 to 1,000 characters, plain text (rendered as text, never Markdown); `lessonId` must exist in the module's current version when the note is created; the sheet autosaves through `notes.save` 800 ms after typing stops (first save creates, later saves update), so nothing sits in localStorage; Save closes the sheet. Notes stay attached to the module across versions; `noteTarget(note, module)` returns the lesson route if the lesson still exists, the module route if not, and "unavailable" if the module is archived or missing.
23. **Notes in closed-book or Read-only accounts:** writing notes follows `staffOwnRecord` availability (training continues in Read-only, brief 24.4).

### Assumptions: Organising and finding modules

24. **Categories are per client.** The pack ships default category definitions (name, colour key, icon key) in packages/content; the seed writes them as Little Acorns' and Oak Tree's Category records. Colours come from a fixed palette of 8 token keys that pass 3:1 against both card backgrounds in light and dark; icons from the existing Icon set. Names 1 to 40 characters, unique per client ignoring case.
25. **Placement.** `ModulePlacement` (key `clientId:moduleId`) holds `categoryId` and `availableToAll`. Staff see a module when it is published and (it satisfies a requirement that applies to them, or they have an open assignment for it, or its placement has `availableToAll: true`). A published module with no placement is visible (M1 behaviour). Pack-based visibility is still the M6 gap (M1 assumption 11).
26. **Groups** hold ordered module ids and `inOrder`. In-order changes display only (numbered steps, "Next in this group"); it never blocks starting a module (brief 16.2: modules can be started in any order; mandatory training is never gated). Group progress is "N of M complete" (a module counts when the person has a `moduleCompleted` for it or a current Evidence for a requirement it satisfies). Assigning a group as a bundle (C4) is M3, with auto-assign rules.
27. **Search** (`searchModules`): case-insensitive and accent-insensitive substring match on module title, description, lesson titles and category name; every whitespace-separated term must match somewhere; match ranges returned for highlighting. **Filters:** category, group, status (Not started, In progress, Completed), requirement (Required, Optional), due (due within the amber window or overdue), length (under 10 minutes). **Sort:** due date (default), recently active, A to Z. **Order:** whatever the sort, results are partitioned as required and due or overdue first, then other required, then optional (17.2). "Required" means the module satisfies an applicable requirement or has an open assignment.
28. **Coming soon cards.** Tier 2 (five topics) and Tier 3 (five topics) from brief 7 appear on S3 as Coming soon cards with title and category, not searchable as modules. Tier 2 content is deferred to M5 (build pack 2.5 cut item 10 allows keeping the cards).

### Assumptions: Display and accessibility

29. **Where settings live.** For any user with a person (staff, and client admins such as Priya), settings are that person's `prefs`, written by `me.updatePrefs(ctx, patch)` (own person only; a dedicated operation, not `people.put`). For the provider side and for S1 before anyone signs in, settings are device prefs in `DemoState.displayPrefs` (new optional field). The active set is applied to `<html>` attributes and CSS variables by one `DisplayPrefsProvider`, so a change shows immediately everywhere and persists across a reload (IndexedDB). This satisfies "per device in the PoC" (data stays on the device) while letting the demo switch personas (Maureen's Simple view and large text).
30. **The settings (brief 19.3) and how each shows:**
    - Text size: Default 100, 125, 150, 175, 200 per cent (`prefs.textScale` 1 to 2), applied as the root font size so every rem scales; the browser's own text setting still applies on top.
    - Display zoom: 100, 125, 150 per cent (`prefs.uiScale`), applied as CSS `zoom` on the app root. The viewport meta never disables pinch zoom (test).
    - Contrast: Standard or High (`data-contrast="high"`: stronger borders, higher-contrast tokens). The device's `prefers-contrast: more` also turns on high contrast.
    - Colour mode: Auto, Light, Dark (existing `data-colour-mode`).
    - Reduce motion: `data-reduce-motion`; also honoured from `prefers-reduced-motion`. Turns off celebrations, confetti and transitions.
    - Sound (default off) and Haptics (default on): sound plays one short tone generated with Web Audio on celebrations; haptics calls `navigator.vibrate(30)` where supported. No audio files.
    - Reading support: spacing Standard or Wide (new `prefs.spacing`: line height 1.8, letter spacing 0.05em, word spacing 0.1em) and font Default or Dyslexia-friendly (`prefs.readingFont`, OpenDyslexic loaded by dynamic import only when chosen). Text is always left-aligned (baseline), so there is no alignment switch.
    - Bigger buttons: `data-bigger-buttons`, minimum touch target 56 px instead of 44 px.
    - Simple view: list instead of path on S3 and S4, no animation, one column, text at least 125 per cent; every action stays available (fully equivalent).
    - Read aloud: show Read aloud buttons (new `prefs.readAloud`, default on) and speed 0.75, 1, 1.25, 1.5 (new `prefs.readAloudRate`, default 1).
    - Reset to defaults: restores the defaults (device settings still apply through the media queries).
    New prefs fields use Zod defaults so older stored records parse.
31. **Read-aloud privacy.** Uses `window.speechSynthesis` and only voices with `localService: true` (remote voices could send lesson text off the device, which would break "no network requests"). If no local voice exists, the button shows "Read aloud is not available on this device". In closed-book attempts it reads only the question and options. Wrapped in a small `speech` adapter so tests can stub it.
32. **Accessibility settings are never paywalled** and work in every account state in which the person can sign in.

### Assumptions: Seed

33. **Seed version 3**, IndexedDB schema version 3 (new stores only); an older stored seed reloads with the same seed value and today (M1 assumption 19).
34. **History (seed stream `history`, Little Acorns only in M2).** Six months of events per person following their pattern (Jade frequent and accurate, Maureen occasional, Sam two weeks only, Grace nothing while on leave, Olivia until she left). Hard constraints, each a seed test: no requirement status, Evidence record or 7.3 persona status changes; passed attempts of requirement-linked modules are seeded only where Evidence of kind `module` already exists with the same `completedAt` and module; all other passes are of the optional modules (Safer eating, Safer sleep); Jade has no Safeguarding lesson, attempt or answer events (so Track A's lesson and quiz flow is unchanged) and no unfinished attempts; Daniel leads Most questions answered correctly (All time, My site) by more than the Safeguarding bank size over Jade, who is second with a clear gap over third, so Jade is "2nd of 13" both before and after Track A; seeded Learn more opens and one lesson with visible drop-off feed C8. Oak Tree and Willow Lane history arrive in M3 on their own streams.
35. **Other seeded M2 data:** sound off in everyone's prefs (brief 19.3); Maureen `simpleView: true`, `textScale: 1.5`, `readAloud: true`; 3 to 6 notes per Little Acorns persona with a staff user (some starred, Jade's include one on Paediatric first aid and one on Safer sleep, none on Safeguarding); 6 categories (Safeguarding, Health and safety, Food and nutrition, Sleep and wellbeing, Induction, Our policies) and 3 groups (New starter induction in order: Safeguarding, Paediatric first aid, Safer eating, Safer sleep, What changed; Baby room essentials: Safer sleep, Safer eating, Paediatric first aid; Annual refreshers: Safeguarding, Paediatric first aid) for Little Acorns and Oak Tree; placements for every nursery module with `availableToAll: true`; a past Safer sleep assignment for the Baby room and Toddler room (due last month, mostly done on time) so the Team board has data; competitions at Little Acorns: Mastery Month (built-in, live from today minus 10 days to today plus 20 days, live leaderboard on, top 3, at least 5 people on the board), Staff bake-off (custom, live), Autumn Complete and Win (built-in, Safer sleep and Safer eating, ended 20 days ago, draw, winner recorded), Closed-Book Challenge (built-in, closed-book only, scheduled from today plus 5 days for 30 days, all modules); StandingBoardSettings for Little Acorns with every board on and staff scope `['site']`.


### M2 conflicts and how they are resolved

1. **Build pack 6 lists XpEntry and BadgeAward records; build pack 4.3 says XP is computed from events.** Derived, not stored (assumption 1). XpEntry gains kind `passed` and an optional `capped` flag.
2. **Seed has `sound: true`; brief 19.3 says sound is off by default.** Seed changes to false. The contract "copies" test that asserts `prefs.sound` stays `true` after a caller mutates a copy is changed to assert it equals the originally stored value (same check, no weakening); logged.
3. **LearningEvent type `noteCreated`** would expose note activity to managers. Not written (assumption 21).
4. **Brief 18.5 "notes private to the device and learner" and 19.3 "settings per device"** versus per-person records in IndexedDB: both stay on the device; notes are own-only by data-layer rule; settings are per person with a device fallback (assumption 29).
5. **Brief 16.2 "modules can be started in any order" versus groups "must be completed in order".** In-order is display only (assumption 26).
6. **Brief 13.1 "hidden people never appear"** versus admins needing winners for draws. Assumption 15.
7. **Track A step 3 "You're 2nd of 13"** depends on seeded history. Assumptions 8, 11 and 34 pin it; the seed test asserts it before and after a full-marks Safeguarding pass by Jade.
8. **Compete tab Battle Room button (5.1)** before M7: shown disabled with "Arrives in a later build" (the M0 pattern for luxury retail on D1).
9. **Nursery pack's `prizeSuggestions` holds 3 placeholders.** Replaced by the 20 brief 13.3 suggestions loaded from `prizes.json` (build pack 13.8: a JSON file per pack).
10. **C14 "choose which scopes staff can see"** with only one scope in M2: the setting is stored and shown, other scopes are listed as "Appears when your organisation has more than one site, region or country" (M3 fills it in).
11. **M1 e2e and seed tests assumed no learning history** (for example C8 "Learn more opened 1"). Chunk 10 changes those assertions to before-and-after deltas or seed-derived expectations. This is not a weakening: the same behaviour is checked against the new seed. The Track A pinned instant may also need re-choosing if new writes before the quiz change the attempt id (the spec already fails with instructions).
12. **Build pack 6 `Attempt` has no abandon state.** Adds `abandoned?: boolean` (assumption 20).
13. **Competition record** gains `teamUnit?: 'team' | 'site'` and `teamTarget?: number`; stored `status` is limited to draft, scheduled and cancelled (assumption 12); `finalStandings` holds the admin projection captured when winners are recorded.

### M2 chunk 2: where the tests differ from the plan

- `xpForAttempt(ledger, attemptId, events)` takes the events (ledger lines carry only `sourceEventId`) and leaves out kinds that earned 0.
- Ledger lines are `XpLedgerEntry` (`XpEntry` without `id`): derived lines are identified by `sourceEventId` and `kind`. `xpLedger` takes an optional `personId` (default: the person with most events) and `config`.
- The line that crosses the daily cap is reduced and also flagged `capped: true`.
- Badge definitions are `{ id, kind, moduleId? }`; Mastery gives one badge `mastery:<moduleId>` per module. Rest weeks before a leave end are looked for at most `maxRestWeeks` (8, placeholder) back, because the leave start is not stored.
- All numbers live in `engagementConfig` (packages/domain/src/engagement/config.ts).

### M2 chunk 3: where the tests differ from the plan

- `winnerNames` returns `{ name, hidden: false }` per winner, and `{ hidden: true }` (no name) for a hidden winner shown to staff. Admins see every name.
- Zeros stay in ranks and "of N", but rows need a value above 0. A viewer on 0 has `rank: null`. `toNext` is the gap to the nearest better value (null at rank 1 or on 0).
- A hidden viewer gets `hidden: true`, a position computed as if included, and no row. Hiding people from rankings is the caller's job (`hiddenIds`); hidden people stay drawable in `drawWinners`.
- Team units with nothing due are returned in a new `unranked` set instead of `values`.
- Beat the Expiry needs earlier Evidence and a `renewEveryMonths` on the requirement. Approved external Evidence counts by `completedAt`; unapproved external does not.
- Team Showdown and the Team board count module assignments (not group bundles, not cancelled) due in `[start, end)` and completed at or before the due instant. Completion has no lower bound, so finishing early still counts. Percentages are rounded down.
- This month and This quarter use London calendar boundaries (DST-safe via `fromLondonWall`).
- `validateCompetition` treats stored status `scheduled` as publish (prize required); `draft` may have an empty prize. Entitlement and limit checks stay in the data layer.
- Leaderboard numbers (top rows 10, default winner count 1, default team target 90) live in `engagementConfig.competitions`.
- Test fixes: `leaderboard.test.ts` built entry ids as `id-P1` while the tests used `id-P01`; ids are now zero-padded to match the names. Fixture types in `competitions/testFixtures.ts` were tightened (type-only) so inputs match the domain types.

### M2 chunk 4: where the tests differ from the plan

- Group assignments count per module: an open assignment of a group makes every module in that group required for that person, and its due date applies to each of them.
- `dueAt` is the earliest of the person's open assignment due dates and the expiry of any applicable requirement the module satisfies that is overdue or expiring soon. `dueState` is `overdue` at or before now, `dueSoon` inside the amber window, else `none`.
- `completed` means a `moduleCompleted` event, or current (not expiring, not expired) Evidence for an applicable requirement the module satisfies. Any other event for the module is `inProgress`.
- Search sort is a three-way partition: required and due first, other required next, then everything else. A module the person finished themselves (`finished`, a `moduleCompleted` event) has nothing left to do, so it sorts with the optional ones; one that is only covered by current Evidence stays with the required ones. Inside a partition the sort key (A to Z, due date, most recent) applies.
- "Under 10 minutes" is strict: exactly 10 is excluded.
- Search is plain substring on folded text (lower case, accents removed, one character in and out so highlight offsets stay valid). Every term must match somewhere in title, description, lesson titles or category name. No regular expressions are built from input.
- Notes: `notesLocked` is true only for the person's own closed-book attempt with no `finishedAt` that is not abandoned. `canReadNote` and `visibleNotes` fail closed for an unknown person. Notes of archived or removed modules stay, flagged `available: false`, and sort after available ones.
- Display: `validateDisplayPrefs` rejects unknown keys and returns the offending field names. `mergeDisplayPrefs` ignores undefined patch values. `displayAttributes` clamps scales, and Simple view raises text to at least 1.25 and turns motion off without touching the saved prefs.

## M2 chunk 5

- `packs/nursery/prizes.test.ts` had two `as string[]` casts that lint flags as unnecessary once `prizes.json` is typed as `string[]`. Removed the casts only (lint autofix); no assertion changed.
- Coming soon card titles live in `comingSoon.nursery.*` in en-GB.json, with the tier in the title text.
- Prettier formatting applied to the chunk 5 test files (whitespace only).

### M2 chunk 6

- Added Paediatric first aid and accidents (EYFS 3.37, 3.39, 3.40, 3.78, 3.79; requirement contentId(602)) and Safer eating, allergies and choking (3.64 to 3.73 except 3.69, 3.72 which are only taught; optional, no requirement link). All cited paragraphs and page numbers were checked against `.sources-cache/eyfs-group.txt` (printed page numbers).
- VERIFY: the HSE first aid training link comes from EYFS footnote 32 and the GOV.UK food safety page URL is from memory (neither could be opened here). Both are listed in each module's `verify` key and in the review checklist. Paragraph 3.39 exceptions are mentioned only briefly.
- Both modules carry `draftContent: true`.
- `build()` in `nursery/modules/index.ts` now takes a minimal `ModuleJson` type instead of `typeof safeguardingJson`. No existing test needed changing.

### M2 chunk 7

- Added Safer sleep (EYFS 3.86; optional, no requirement link) and What changed in September 2026 (EYFS 3.15, 3.17, 3.82, 3.86, 3.94 and footnote 20; requirement contentId(604)). Every cited paragraph and the facts taught were checked against `.sources-cache/eyfs-group.txt` with `rg -n` (printed page numbers). Both carry `draftContent: true`.
- VERIFY: 3.86 starts on page 40 but its bullets continue on page 41; links use page 40. The GOV.UK banned dogs URL is from memory and could not be opened here. The screen use guidance address is not in the cached text, so no link to it. The Crime and Policing Act 2026 was not read; the regulated activity wording comes from footnote 20. Which paragraphs are headline changes for September 2026 is assumed, not checked against a DfE change list. The one-off trip helper exception in a scenario should be reviewed. NHS and Lullaby Trust advice named in 3.86 is not linked (not on the official-source list). All are in each module's `verify` key.

### M2 chunk 8

- The contract suite's `ALL_STORES` list (suite.ts) gains the six new stores, because `dumpAll` now returns them (plan: add to `dumpAll`). Same check, longer list. Lint-only edits removed redundant type assertions in the chunk 8 test files.
- A new `modulePlacements` row made by `setCategory` or `setAvailable` starts with `availableToAll: true`, because a module with no placement is visible today (assumption 25); starting at false would hide it from staff.
- `notes.save` does not check the closed-book lock (only `list` and `get` do, as assumption 20 says). A note on an existing record may keep a lesson that a newer version dropped; a new or changed lesson must exist (`lessonMissing`). Creating a note needs a published module; editing one on an archived module is allowed.
- `categories.reorder` hands the ids' existing order slots out in the new sequence, so a subset can be reordered without touching other categories. Organise writes write no audit event (the batch tests require exact store sets).
- Added `errors.rule.*` keys for every new `RuleName` in en-GB.json (the competition ones are used from chunk 9).

### M2 chunk 9

- Competitions and leaderboards live in packages/data/src/competitionOps.ts. The RuleNames and `errors.rule.*` strings were already added in chunk 8, so no change there. Domain gained only `defaultBoardSettings` (all six boards on, staff scope `site`), used when a client has not saved board settings.
- `competitions.save` ignores the `status`, `winners` and `finalStandings` of its input: a new competition is always a draft, and publish, cancel and recordWinners own the rest. First broken builder rule from `validateCompetition` becomes the `RuleError`.
- Staff see scheduled, live and ended competitions only (never drafts or cancelled). Staff copies drop `winners`, `finalStandings` and `eligibility.excludePersonIds` so no other person's id leaves the data layer; the staff standings view carries `eligible` instead so the app can show the "not eligible" note.
- Publish counts stored-`scheduled` competitions that have not ended (custom and built-in) towards `liveCompetitions`; `NotEntitledError('closedBookCompetitions')` for closed-book-only on a package without it. Needs `newCompetitions` availability (also on create).
- `extend` refuses any earlier end (`endShortened`), including before the start; recordWinners on a custom competition gives `invalidCompetition` (custom winners are not computed).
- Admin standing boards: whole client (limited to sites the admin can read), or one site via optional `siteId`; staff get their own primary site (M2). Team boards list teams with nothing due by name in `unranked`.
- `saveSettings` writes a slim `competitions.boardSettingsSaved` audit event (board count only).

### M2 chunk 10

- Seed version 3. The seed history is built in packages/seed/src/history.ts on a new `history` RNG stream, so every earlier stream and every Evidence record is unchanged (the Evidence hash is pinned in m2Seed.test.ts). History, notes, categories, groups, placements, competitions and board settings are seeded for Little Acorns; categories, groups and placements also for Oak Tree. Oak Tree and Willow Lane history arrive in M3.
- Attempts and events are made with the same domain functions the data layer uses (`drawQuestions`, `checkAnswer`, `scoreAttempt`), so scores and pass flags are consistent.
- Safeguarding and Paediatric first aid Evidence is `external` for everyone except Jade (whose Safeguarding is a module record from 18 months ago), so no passed attempt of those modules can exist (it would need matching module Evidence). Passed attempts are therefore of Safer eating, Safer sleep, and What changed (only where the person's existing module Evidence has the same `completedAt`).
- To keep Daniel first on Most questions answered correctly by more than the Safeguarding bank (19) over Jade, who cannot have Safeguarding events, Daniel's Safeguarding (two closed-book) and Paediatric first aid (two open) practice attempts are failed attempts that together cover the bank. Failed attempts write no Evidence. Jade has 30 correct questions (Safer sleep, Safer eating, What changed), Daniel 56, nobody else above 20. After Track A Jade has 49, still second of 13.
- Baby and Toddler room Safer sleep assignments are due 29 days ago (September). Sam's is cancelled because he joined after the due date, and Grace's stays open because she is on leave. The team board therefore shows Baby room 100 and Toddler room 75.
- Seeded Learn more opens are on wrong answers in open attempts, always before today. The Safer eating last lesson is viewed by 10 people and finished by 5, which feeds the C8 drop-off view.
- Conflict 11: m1.test.ts assertions about "the only assignment" now compare Safeguarding assignments only (Jade also has a Safer sleep one), and the "keeps local changes" test uses the Safeguarding assignment and compares counts to the seeded total.
- Other tests adjusted for the seeded history (conflict 11, never deleted): the data contract world drops the new seeded stores like it already drops the M1 ones (the suite builds its own records); persistence tests expect seed version 3; the S6 and S7 web tests count Jade's Safeguarding records only; the C8 web test expects the seeded Safeguarding stats (average 70%, pass rate 0%, then 80% and 50% after Jade passes) and no unanswered questions.

### M2 chunk 11

- 15 new UI components in packages/ui (charts share ChartShell). Dialog gained an optional `className` and falls back to the `open` attribute when `showModal` is missing (jsdom). Celebration keyframes live in tokens.css under the existing reduced-motion rule. `--cat-N` category colour tokens do not exist yet, so Chip, CourseChip and Celebration use `var(--cat-N, fallback)`; add the tokens when categories are wired up (chunk 13). No 56px bigger-buttons variant exists yet; chunk 12 should add one on `--target-min`. ReadAloudBar has an optional `rateLabel` prop.

## M2 chunk 12: display and accessibility

- **Device copy of applied display settings.** `localStorage` keys `sta.display.applied` (the html attributes and CSS variables last applied) and `sta.display.pending` (a display change still being saved) hold presentation values only. The first lets a reload show the right text size and colours before IndexedDB has loaded; the second re-saves a change if the page was reloaded before the save finished. The data layer (`me.updatePrefs`, or `DemoState.displayPrefs` on the provider side) stays the source of truth and replaces both copies once loaded. No network, nothing personal beyond display choices.
- **Read aloud on lessons** is a plain "Read this aloud" button over the current step's text, using the local-voice speech adapter, rather than the full ReadAloudBar (which would repeat the lesson text on the page). ReadAloudBar remains for later chunks. Quiz read-aloud is chunk 14.
- **Badge collection on S11** waits for chunk 15 (badges UI); S11 has nickname, hide from leaderboards, display name preview and the two links.
- **Acceptance test corrections.** `me.test.tsx`: the Notifications link is looked up inside `main` (the header bell has the same name) and `hideFromLeaderboards` is read from `person.prefs` where the schema keeps it. `e2e/helpers/quiz.ts finishLessons` added and used by the quiz-passing steps because Jade has no lessons done in the seed, so the quiz is closed until the lessons are read. `e2e/helpers/layout.ts` ignores visually hidden (1px) text and does not compare fixed bars with scrolling content.

### M2 chunk 13

- **Category colour tokens.** `--cat-1` to `--cat-8` (green, blue, amber, purple, rose, teal, slate, brown) are in `packages/ui/src/tokens.css` for light, dark (explicit and automatic) and high contrast (light and dark). Colour is always paired with an icon and the category name.
- **Where C10 lives.** `#/client/organise` is a lazy route, reached from the client More menu ("Organise modules"). `#/client/modules` stays the Training placeholder until a later chunk.
- **Own permissions come from the data layer.** `usePermissions` read `roleAssignments` and `roles`, which need `staff.view`, so a Viewer (only `modules.view`) always looked as if they had no permissions. New `store.access.permissions(ctx)` returns the caller's own effective permissions (never anyone else's), with a contract test. The UI still checks `can()` on the result.
- **`modulePlacements.setCategory` without `categoryId`** now takes the modules out of any category (the "No category" choice on a module row). Contract test added.
- **Learn order.** `partition` in `catalogue/learn.ts` is now: unfinished required and due, unfinished required, unfinished optional, finished required, finished optional. The old rule put finished required modules level with optional ones, which hid Jade's "What changed in September 2026" below optional modules; the existing domain tests still pass.
- **Test corrections.** `learn.test.tsx` A to Z test: Safeguarding is required and due soon, so it stays first under every sort (plan assumption 27), and A to Z orders the rest; the old expectation put it second. `staff.test.tsx` S3 search test finds the row by link name because matches are now highlighted in `<mark>`, which splits the text. `e2e/organise.spec.ts`: searching "rest and rhythm" matches the category name, not the module title, so the highlight is checked on the row (which shows the category name highlighted) instead of inside the title link.
- **S3 details.** Search clears with "Clear the search box" (inside the field) and "Clear search" (no-results state), so names stay unique. Filters apply on "Show N modules"; category cards and group buttons apply their filter straight away. Category cards and the Categories filter list only categories that have at least one visible module. Coming soon cards show only for the nursery pack and only with no search or filter. Simple view keeps the same list with no path markers.
- **S4 Notes button** opens a "Notes for {course}" sheet that lists the course notes read-only (or a plain message while a closed-book attempt locks them). Adding, editing and the full panel are chunk 14.

### M2 chunk 14

- **Add note and the notes panel are shared.** `Notes.tsx` holds the Add/Edit sheet, the "Notes for <course>" panel and the Notes button. The same panel opens from S4, S5 and the S6 notes control, so a learner sees the same edit, star and delete controls everywhere. The language key `notes.add` now reads "Add note" (was "Add a note") to match the acceptance tests.
- **Autosave** creates the note on the first save and updates the same note afterwards (saves run in order). Leaving the sheet or the lesson while a save is waiting saves it at once. A whitespace-only note is never saved, and "Save note" on an empty box shows a message instead of closing.
- **S6 notes control** stays labelled "Notes shown: standard XP" for the rest of the question once the panel has been opened (not only while it is open), because opening it is what costs the bonus XP. Each new question starts hidden again.
- **Closed-book choice** is shown only when no unfinished attempt exists, the module is not closed-book-only, and a live closed-book competition the person is eligible for covers the module (`closedBookChoiceApplies`). Abandoned attempts are left out of the module's attempts, so "Resume quiz" is never offered for an attempt the person left.
- **Read aloud on S6** speaks the prompt, the scenario step text and the option text only. Notes are never passed to the speech adapter.
- **Fresh progress after a lesson or quiz.** `LessonPlayer` and `Quiz` now refresh the `learning` query before navigating. Without it the module overview briefly showed the old progress and its "Resume" link pointed at a lesson that was already done. This was the cause of the recurring `client-dashboard.spec.ts` "C1 updates in one tab" flake: tab B sometimes repeated a finished lesson, skipped the last one, and never saw "Start quiz". Eight runs in a row now pass (it failed about one run in six before).
- **Test corrections (not weakened).** The chunk 14 tests were written before the seed had history, and assumed an empty past:
  - `quizModes.test.tsx`: the notesVisible and learnMoreOpened checks now look only at events created by the attempt under test (the seed already holds answers and Learn more events for the same questions, so `find` and `at(-1)` picked seeded events). The "no Read this aloud button" test now turns `readAloud` off, since the default is on for everyone (assumption 31) and the test never switched it off.
  - `e2e/closed-book.spec.ts`: Jade has already finished Safer sleep's lessons in the seed, so the test opens the first lesson from the list instead of a "Start" link, and counts only the closed answers added during the test (the seed has closed-book history).

### M2 chunk 16

- **Hidden viewer's count.** A person who hides from leaderboards sees "You're 2nd of 13. Only you can see this." The count includes them (plan assumption 9: "computed as if they were included"), while everyone else sees 12. `e2e/compete.spec.ts` expected "of 12" for Jade herself; that contradicted the plan and the domain tests, so it now expects "of 13. Only you can see this". Not weakened: it still proves the private line shows and that no row of her own appears.
- **Entitlements read.** Added `competitions.entitlements(ctx)` (client admins with `competitions.view`) so the builder can call `entitled()` without reading billing records. `clientEntitlements` now prefers the client's subscription package over the copy on the client record; `competitionBuilder.test.tsx` moves a subscription to Essentials and expects the closed-book switch to be disabled. Contract test added.
- **Builder scope.** Eligibility pickers (job roles, teams, sites, exclusions) are not in the builder yet: new competitions are open to every active person and an edit keeps the eligibility it already has. The data layer and metrics already support them. A module picker appears for Complete and Win only. Region, country and all-sites scopes in C14 are shown as "appears when your organisation has more than one site, region or country" (M3).
- **Layout details.** C11 lists cancelled competitions under Ended with the status word "Cancelled". The S2 banner name is a button that opens the same details sheet as S10; the sheet is only mounted while open, and focus goes back to the banner on close. All six standing boards load together so the region appears complete. Dates entered in the builder are London days: starts at 00:00 and ends at 23:59:59.
- **Navigation label.** The client navigation item that opens C11 is now "Competitions" (was "Engage", build pack 5.x), because the navigation and route tests require each page's h1 to equal its menu label and the C11 acceptance tests require the h1 "Competitions". `e2e/routes.ts` uses the new label; no assertion was loosened.
