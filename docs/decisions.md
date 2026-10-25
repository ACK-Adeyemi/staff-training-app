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
- **Direct Evidence puts** need `evidence.approve` (client) and are refused for staff and provider; module-completion evidence written by staff arrives with M2 and will add an explicit rule.
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
