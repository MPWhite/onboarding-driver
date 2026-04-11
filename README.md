# pip

> A tiny mouse that helps your users.

**pip** is an open-source drop-in help widget that any website can add in essentially one line of code. A little mouse cursor lives in the corner of your page with an "ask pip" pill next to it. Users type a question, and the cursor walks across the page to whatever they should click next, explaining from a speech bubble as it goes.

## Status

**v1 — alpha.** The core widget, backend adapter, and Next.js demo app all build and typecheck. The streaming pipeline is wired end-to-end. Not yet published to npm and not yet stress-tested in the wild — expect rough edges, but it's real code.

## What it does

- **Drop-in install.** One `<script>` tag or one import adds the mouse cursor and its "ask pip" pill to any page.
- **Contextual help.** Each question ships a screenshot, a trimmed DOM snapshot, and your docs (a markdown file, by default) to an LLM. Answers are grounded in what the user is actually looking at, not generic chatbot-speak.
- **Visual pointing, not chat.** No message history, no support-desk panel. When the model knows where to point, the cursor animates across the viewport to the target, dims the rest of the page with an SVG ring, and hangs its speech bubble off the new position. Auto-dismisses on scroll, resize, click, or Escape — the cursor walks back home.
- **Self-hosted and open source.** You run the backend route. You hold the LLM key. User data never touches infrastructure you didn't choose.
- **Privacy-defensible.** Password fields and credit-card inputs auto-redacted, dev-configurable redaction selectors, `[data-pip="redact"]` attribute, first-use consent dialog, persistent kill switch. All redaction happens *client-side before the fetch*.

## Quick start

```bash
pnpm install
cd apps/demo
echo "AI_GATEWAY_API_KEY=<your key>" > .env.local
pnpm dev
```

Open the demo app, type a question into the "ask pip" pill in the bottom-right corner, and watch the cursor walk to the answer. See [apps/demo/README.md](apps/demo/README.md) for more.

## Architecture

- **`@pip-help/core`** — vanilla TypeScript widget. Closed Shadow DOM, framework-free, **~15 KB gzipped** (well under a 35 KB budget). Ships as IIFE (for `<script>` tag users) + ESM + CJS.
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
