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
