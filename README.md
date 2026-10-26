# Staff Training App (proof of concept)

A static demo of a staff compliance training app with three surfaces (staff, client admin, provider admin). All data is fictional and lives in the browser.

## Setup

Needs Node 24 and pnpm (`corepack enable`).

```sh
pnpm install
git config core.hooksPath .githooks   # once per clone: installs the commit checks
```

## Run

```sh
pnpm dev --host 0.0.0.0               # http://localhost:5173/staff-training-app/
```

Routes use the hash: `#/staff`, `#/client`, `#/provider`. Add `?reset=1` to reset the demo on load.

## Test

```sh
pnpm lint && pnpm typecheck
pnpm test                             # Vitest
pnpm e2e                              # Playwright (first: pnpm exec playwright install chromium)
scripts/check.sh                      # every gate; add --install to fetch Chromium
```

## Build and preview

```sh
pnpm build
pnpm preview --host 0.0.0.0           # http://localhost:4173/staff-training-app/
```

`BASE_PATH` (see `.env.example`) sets the public path; it defaults to `/staff-training-app/`.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds with the repository name as the base path and publishes `apps/web/dist` to GitHub Pages. One-off setup: in the repository settings, set Pages source to "GitHub Actions". The `checks` CI job must pass before merging.

## More

Docs are in `docs/`: `decisions.md`, `demo-script.md`, `review-checklist.md`.
