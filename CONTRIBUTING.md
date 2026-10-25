# Contributing to Nenrin

Thanks for helping! Nenrin is a small, local-first PWA, and we want to keep it that way.

## Before you start

- For anything bigger than a small fix, **open an issue first** so we can agree on the approach.
- Read [AGENTS.md](AGENTS.md). Its rules apply to everyone, human or AI. Above all: **only permissive dependencies, and never copy code from Anki or other copyleft projects.**
- Check [PLAN.md](PLAN.md) to see what's in scope for the current phase.

## Setup

```bash
npm install
npx playwright install chromium   # once, for e2e tests
npm run dev
```

## Before opening a PR

```bash
npm run lint && npm test && npm run build && npm run test:e2e
```

- Keep PRs to one concern, with tests for any behavior change.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` …).
- If you change the UI, run `npm run screenshots` and include the updated images.
- If you finish a roadmap item, tick it in `PLAN.md`.

## AI-assisted contributions

AI-written code is welcome; this project is openly vibe-coded. You're still responsible for it: read every line, run the tests, and say in the PR description which tools you used.

## Code of conduct

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
