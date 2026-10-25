# Agent app template

A starting point for apps built by a team of Claude agents running unattended inside an isolated VM. Create each new app from this template; every app gets its own repo, containers, database and agent runs.

## How it fits together

| Layer | What it does |
|---|---|
| Hyper-V VM | Boundary between the agents and your Windows machine. No shared folders or clipboard; private networks blocked. |
| Proxy allowlist | Agents reach only Anthropic, GitHub, npm, PyPI, Docker Hub and Debian, over HTTPS. |
| `agent` user + rootless Docker | Agents have no admin rights on the VM. |
| Dev container (per app) | Toolchain and Claude Code, seeing only this app's folder, plus its own Postgres. |
| Claude Code auto mode | Agents work without permission prompts while a safety classifier blocks risky actions. |
| Hooks (`.claude/hooks/`) | Block pushing, editing guardrails, writing secrets files, and finishing with failing checks. |
| You + GitHub | Agents can't push. You review each branch, ship it as a PR, CI checks it, and protection rules stop anything reaching `main` without you. |

## The agent team

`/build <what>` (or just asking Claude to build something) runs:

1. **planner** (Opus): writes `docs/plans/<feature>.md` with acceptance criteria, a test plan and security notes.
2. **test-writer** (Sonnet): writes failing tests for every acceptance criterion.
3. **implementer** (Sonnet): makes the tests and `scripts/check.sh` pass.
4. **security-reviewer** (Opus): reviews the diff and dependencies; Critical or High findings go back to the implementer.
5. **code-reviewer** (Sonnet): checks correctness and test quality; must-fix items go back to the implementer.

It finishes with a report: what changed, how to try it, assumptions, review verdicts, and anything that needs you.

## Creating a new app from this template

1. **GitHub**: on this template repo, click **Use this template → Create a new repository**. Make it public (demos) and name it after the app.
2. **Protect `main`** (Settings → Rules → Rulesets → New branch ruleset): target the default branch, set enforcement to Active, and turn on:
   - Require a pull request before merging (0 approvals, because GitHub won't let you approve your own PRs; your merge click is the approval)
   - Require status checks to pass: `checks` and `dependency-review`
   - Block force pushes, and restrict deletions
3. **Security features** (Settings → Code security): turn on Dependabot alerts and security updates, secret scanning with push protection, and CodeQL default setup.
4. **Actions** (Settings → Actions → General): require approval for workflow runs from all outside collaborators.
5. **Token**: add the new repo to your `agent-vm-ship` fine-grained token's repository list.
6. **VM, as admin**: `ship init <app> https://github.com/<you>/<app>.git`
7. **VM, as agent**:
   ```bash
   git clone https://github.com/<you>/<app>.git ~/projects/<app>
   cd ~/projects/<app> && scripts/agent up && scripts/agent doctor
   ```
8. Describe the app in the "About this app" section of `CLAUDE.md` (do it on a branch and ship it like any other change).

## Daily use

On the VM, as the `agent` user (`sudo -iu agent`), inside the app folder (`cd ~/projects/<app>`):

```bash
scripts/agent up                       # start this app's containers
scripts/agent claude                   # interactive: say "build ..." and check in on it
scripts/agent task "add a login page"  # background: runs /build on a new branch
scripts/agent logs                     # follow the background run
scripts/agent status                   # containers, branch, running task
scripts/agent sync                     # after you merge a PR, update local main
scripts/agent doctor                   # check token, containers, proxy, Claude Code
scripts/agent down                     # stop containers (data is kept)
```

Run one thing at a time per app: a background task and an interactive session in the same repo will trip over each other's edits. Different apps can run at the same time.

Then, as your admin user:

```bash
ship list <app>               # see the agent's branches
ship <app> agent/<branch>     # review the summary, push, open a PR
```

Review the PR on GitHub (start with the plan in `docs/plans/`, then the tests, then the code), wait for CI, and merge. Finally run `scripts/agent sync` as `agent`.

## Viewing the running app from Windows

1. Uncomment the `ports` block in `.devcontainer/compose.yaml` (e.g. `127.0.0.1:3000:3000`) and run `scripts/agent up`.
2. Start the app inside the container (`scripts/agent shell`, then the app's run command).
3. On Windows: `ssh -L 3000:localhost:3000 iamgroot@<vm-ip>`, then open http://localhost:3000.

The port is only bound to the VM's localhost, so nothing on your network can reach it.

## When agents need something you control

Agents can't change these, by design. They list requests under "Needs a human" in their report:

- **CI, the container, agent config** (`.github/`, `.devcontainer/`, `.claude/`, `scripts/agent`): make the change yourself, on a branch, reviewed like any other.
- **A new network domain**: add it to `/etc/squid/allowed_domains.txt` as admin and run `sudo systemctl reload squid`. Add only what's needed.
- **Accounts, secrets, deploy settings**: these never go into the VM or the repo.

## Costs and limits

Claude Pro usage is shared between your chats and these agents, with a five-hour window and weekly caps. Opus (planner, security reviewer) uses the allowance fastest. If runs keep stopping on limits, trim scope per task or move up a plan.

## Troubleshooting

- `scripts/agent doctor` checks the common problems.
- A run that seems stuck: `scripts/agent logs`, then `scripts/agent shell` and `ps aux`.
- "No Claude token saved": run `claude setup-token` on the VM as `agent`, then `scripts/agent token`.
- Rebuild the container after Dockerfile changes: `scripts/agent down && scripts/agent up`.
- Start completely fresh (deletes the app's database and Claude history): `scripts/agent reset`.
