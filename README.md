# pip

> A tiny mouse that helps your users.

**pip** is an open-source drop-in help widget that any website can add in essentially one line of code. Users click a mouse icon in the corner, ask a question in natural language, and get a contextual answer grounded in your site's own docs — plus a visual arrow pointing at exactly where to click next.

## Status

**v1 — alpha.** The core widget, backend adapter, and Next.js demo app all build and typecheck. The streaming pipeline is wired end-to-end. Not yet published to npm and not yet stress-tested in the wild — expect rough edges, but it's real code.

## What it does

- **Drop-in install.** One `<script>` tag or one import adds a floating mouse to any page.
- **Contextual help.** Each question ships a screenshot, a trimmed DOM snapshot, and your docs (a markdown file, by default) to an LLM. Answers are grounded in what the user is actually looking at, not generic chatbot-speak.
- **Visual pointing.** The model can highlight the specific button or field the user should touch next — dimmed backdrop, SVG ring, caption. Auto-dismisses on scroll, resize, click, or Escape.
- **Self-hosted and open source.** You run the backend route. You hold the LLM key. User data never touches infrastructure you didn't choose.
- **Privacy-defensible.** Password fields and credit-card inputs auto-redacted, dev-configurable redaction selectors, `[data-pip="redact"]` attribute, first-use consent dialog, persistent kill switch. All redaction happens *client-side before the fetch*.

## Quick start

```bash
pnpm install
cd apps/demo
echo "AI_GATEWAY_API_KEY=<your key>" > .env.local
pnpm dev
```

Open the demo app, click the mouse in the bottom-right corner, and ask a question about the page. See [apps/demo/README.md](apps/demo/README.md) for more.

## Architecture

- **`@pip-help/core`** — vanilla TypeScript widget. Closed Shadow DOM, framework-free, **~14 KB gzipped** (well under a 35 KB budget). Ships as IIFE (for `<script>` tag users) + ESM + CJS.
- **`@pip-help/server`** — thin backend adapter around the [Vercel AI SDK v6](https://sdk.vercel.ai) `ToolLoopAgent`. Framework-agnostic `createPipHandler(config)` plus a dedicated Next.js entry. Uses AI Gateway model strings (`provider/model`) by default.
- **`apps/demo`** — Next.js 16 App Router demo: a fake project-management dashboard with pip auto-mounted and a `/api/pip` route.

Default model: `anthropic/claude-sonnet-4.6` via the Vercel AI Gateway. Swappable — any AI SDK v6 provider works.

## Repository layout

```
pip/
├── .github/workflows/        CI — typecheck, build, bundle size gate
├── apps/
│   └── demo/                 Next.js 16 App Router demo site
├── docs/
│   ├── design/               Versioned design docs (RFCs)
│   ├── api/                  Client and server config reference
│   └── getting-started.md    5-minute integration guide
└── packages/
    ├── core/                 @pip-help/core — the widget
    └── server/               @pip-help/server — backend adapter
```

## Design docs

Significant architecture and RFC-style design decisions are versioned in [`docs/design/`](docs/design/) and reviewed via PR alongside the code. Start with [v1 design](docs/design/2026-04-07-v1-design.md) if you want the deep architecture tour.

## Contributing

The repo uses pnpm workspaces + Turborepo. Node 24 is pinned via `.nvmrc`.

```bash
pnpm install
pnpm turbo run typecheck build test
```

All workspace-wide tasks run through turbo. Each package is individually buildable with `pnpm --filter @pip-help/<name> <task>`.

## License

[MIT](LICENSE).
