# Contributing to pip

Thanks for wanting to help. pip is small and deliberately boring — two packages, a demo app, and a design doc. This guide gets you to a working dev loop in about two minutes.

## Setup

You need Node 24 (`.nvmrc` pinned) and pnpm 10.

```bash
git clone https://github.com/MPWhite/onboarding-driver pip
cd pip
pnpm install
```

## What the workspace looks like

- `packages/core` — `@pip-help/core`, the vanilla-TS widget. No framework dependency.
- `packages/server` — `@pip-help/server`, the backend adapter around the Vercel AI SDK.
- `apps/demo` — a Next.js 16 demo app that exercises both packages end-to-end.
- `docs/` — user docs, API reference, and versioned design docs under `docs/design/`.

## Dev loop

Turborepo handles everything from the root:

```bash
pnpm turbo run typecheck test build    # Full verification, ~5s cold
pnpm turbo run dev                     # Watch mode across all packages
```

You can also target a single package:

```bash
pnpm --filter @pip-help/core test          # Run core unit tests
pnpm --filter @pip-help/core dev           # tsup --watch on the widget
pnpm --filter @pip-help/demo dev           # Next.js dev server on :3000
```

## Before you open a PR

Run the same checks CI runs:

```bash
pnpm turbo run typecheck test build
node scripts/smoke-test-dist.mjs
```

If that passes and `packages/core/dist/iife.js` gzips to under 35 KB, CI will be green. The bundle-size check is in [`.github/workflows/ci.yml`](.github/workflows/ci.yml); it's a one-liner, not a tool dependency.

### Add a changeset

Any PR that changes behavior in `@pip-help/core` or `@pip-help/server` should include a [changeset](https://github.com/changesets/changesets) so the version bump and changelog are automated:

```bash
pnpm changeset
```

Pick which packages changed, choose the bump type (`patch` / `minor` / `major`), and write a user-facing one-line summary. It'll create a markdown file in `.changeset/` — commit it with your PR.

`@pip-help/core` and `@pip-help/server` are configured as a [fixed group](.changeset/config.json), so they version together. A change to either bumps both. The demo app (`@pip-help/demo`) is ignored from releases.

Changes that don't affect shipped behavior (docs, tests, CI) don't need a changeset.

## Commit style

Conventional-commits-ish, not strictly enforced. The existing history uses:

- `feat(core): …`, `feat(server): …`, `feat(demo): …` for features
- `fix: …` or `fix(core): …` for bug fixes
- `docs: …` for documentation-only changes
- `test: …` for test-only changes
- `chore: …` for tooling, CI, dependency bumps
- `refactor: …` for no-behavior-change refactors

Commit messages explain *why*, not just *what*. The diff already shows what. Bulleted bodies are fine for multi-part commits.

## Design docs

For non-trivial architectural changes, land a design doc in `docs/design/` **before** the implementing PR (or in the same PR if they're closely coupled). Template:

```markdown
# Title — short version

**Status:** Draft   ← bumps to Accepted once merged
**Date:** YYYY-MM-DD
**Author:** your-handle

## Context
## Goals
## Non-goals
## Design
## Open questions
```

Add a row to `docs/design/README.md`'s index when you land the file. Filename convention is `YYYY-MM-DD-short-topic-design.md`. See [2026-04-07-v1-design.md](docs/design/2026-04-07-v1-design.md) for a real example.

## Tests

- **`packages/core`** — Vitest with jsdom. Tests live alongside source as `*.test.ts`. The two highest-signal test files are `redact.test.ts` (security-critical — password field detection, fail-closed on redaction failure) and `stream.test.ts` (SSE parser edge cases).
- **`packages/server`** — Vitest with the node environment. Tests cover prompt building and request validation. End-to-end LLM calls are intentionally **not** mocked in unit tests — they're exercised manually through the demo app.

If you're adding logic to the capture pipeline, redaction paths, or the stream parser, a unit test is table-stakes. Widget UI and styling changes are exempt — they'd need a real browser harness we haven't built yet.

## The privacy invariant

The one thing that must **never** regress: **unredacted page content cannot leave the browser.** Every code path that builds the outgoing payload must go through `capture/redact.ts`'s redaction pipeline, and any failure must fail closed (throw, not fall back to the original screenshot). See the `RedactionError` class and its tests — those exist specifically to lock in this invariant.

If a change you're making touches `capture/` or the outgoing payload shape, please add a test asserting the fail-closed behavior of your new path.

## Reporting bugs

File an issue with:

1. What you did
2. What you expected
3. What actually happened
4. A minimal reproduction if possible (a `pip.md` + HTML snippet is usually enough)
5. Browser + OS

For security issues, please don't file a public issue — see [SECURITY.md](SECURITY.md) for the private reporting path.

## License

By contributing, you agree your contributions are licensed under the MIT license that applies to the rest of the repo.
