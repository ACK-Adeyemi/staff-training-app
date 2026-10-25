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
