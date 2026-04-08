# Changelog

All notable changes to pip are documented here. Format based loosely on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it reaches 1.0.

## [Unreleased]

Everything on `main` so far — nothing has been published to npm yet.

### Added
- `@pip-help/core` — vanilla-TS widget with Shadow DOM isolation, mouse button, chat panel, consent dialog, pointing overlay, client-side redaction, and streaming transport. Ships as IIFE + ESM + CJS. ~14 KB gzipped.
- `@pip-help/server` — backend adapter wrapping the Vercel AI SDK v6 `ToolLoopAgent`. `createPipHandler()` returns a `(Request) => Promise<Response>` function compatible with Next.js App Router and any fetch-based runtime. Ships with a `highlight` tool, `markdownFileContext` helper, and an `onError` passthrough for custom error handling.
- `apps/demo` — Next.js 16 App Router demo with a fake project-management dashboard, pip auto-mounted, and an `/api/pip` route wired through the server adapter.
- Full design doc at [`docs/design/2026-04-07-v1-design.md`](docs/design/2026-04-07-v1-design.md).
- End-user docs: [`docs/getting-started.md`](docs/getting-started.md), [`docs/api/client-config.md`](docs/api/client-config.md), [`docs/api/server-config.md`](docs/api/server-config.md).
- Package READMEs, demo README, CONTRIBUTING, SECURITY, issue templates.
- GitHub Actions CI: typecheck + test + build + 35 KB gzipped bundle gate.
- Vitest unit test suite: **160 tests** in core, **15** in server, **175 total**.

### Security
- Client-side redaction pipeline with a **fail-closed** invariant: if redaction cannot complete for any reason (canvas context creation fails, toDataURL throws on a tainted canvas), the transport throws a `RedactionError` instead of sending the unredacted screenshot. This is enforced by unit tests that mock the failure paths. Always-on redaction selectors: `input[type="password"]`, `input[autocomplete*="cc-"]`, `[data-pip="redact"]`.
- First-use consent dialog with persistent kill switch stored in `localStorage`. Declining consent parks the widget in paused state rather than hiding it, so users can always unpause from the header.
- Closed Shadow DOM so host-page scripts cannot traverse `el.shadowRoot` to scrape chat transcripts or the redaction config.
- Default AI SDK error masking preserved on the server (`"An error occurred."`) unless the dev explicitly opts in to a custom `onError` that surfaces real error text. Provider errors can contain API key hints or tokens, so raw-text pass-through is opt-in only.

### Notes
- `@pip-help/*` is a placeholder scope — final npm scope will be confirmed before first publish.
- Not yet published to npm.
- Not yet smoke-tested end-to-end against a live AI Gateway. The pipeline builds, typechecks, and passes 175 unit tests — but the first "real user clicks the mouse and gets a pointing arrow" test will happen once a key is provisioned for a demo deployment.
