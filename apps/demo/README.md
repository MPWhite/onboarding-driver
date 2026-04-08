# @pip-help/demo

Next.js 16 demo site for **pip** — a fake project-management dashboard used to dogfood the widget end-to-end.

## Run it locally

From the repository root:

```bash
pnpm install
```

Then configure an AI Gateway key (local dev only — production on Vercel uses OIDC automatically):

```bash
cd apps/demo
cp .env.example .env.local
# Edit .env.local and paste your AI_GATEWAY_API_KEY
# Create one at https://vercel.com/dashboard/ai-gateway/api-keys
```

Start the dev server:

```bash
pnpm dev
# or from the root:
#   pnpm --filter @pip-help/demo dev
```

Open <http://localhost:3000>. A mouse icon appears in the bottom-right corner. On first click, accept the consent dialog, then ask something like:

- "How do I make a new project?"
- "Where do I see only active ones?"
- "What does the Draft badge mean?"

The widget takes a screenshot of the current page, ships it to `/api/pip`, and streams back a contextual answer. When the model decides to point at something, a dimmed backdrop + SVG arrow appears over the target element.

## What's in this app

- `app/page.tsx` — the fake product UI: sidebar nav, header with a `+ New project` button, filter chips, and four sample project cards.
- `app/layout.tsx` — Server Component root layout that renders the page + a `<PipMount>` client component sibling.
- `app/pip-mount.tsx` — a one-effect client component that calls `pip.mount({ endpoint: '/api/pip' })`. Kept separate so the layout stays a Server Component and `@pip-help/core` (which touches `document`) isn't imported on the server.
- `app/api/pip/route.ts` — the backend route. Uses `createPipHandler` from `@pip-help/server/next` with the `anthropic/claude-sonnet-4.6` Gateway model string and `markdownFileContext('./pip.md')`.
- `pip.md` — the context blob the LLM sees on every turn. Contains the layout reference, common questions with the element to point at for each, a list of things NOT on the page (so the model doesn't invent features), and tone guidance.

## Editing the context

The `pip.md` file is read fresh on every chat turn — edit it and the next question picks up the changes without a restart. Use it to tune how pip describes your product and which questions it knows how to answer.

## Troubleshooting

**"pip server error 500" in the chat panel**
Usually means the Gateway key is missing or invalid. Double-check `.env.local`, then restart the dev server (`pnpm dev` picks up env changes on restart, not hot).

**Widget doesn't appear**
Open DevTools and look for `[pip]` log lines. In dev mode the widget logs to `console` under the `debug: true` config in `pip-mount.tsx`. If you see `auto-mount skipped: no config found`, the mount call isn't running — check that `<PipMount />` is rendered in `app/layout.tsx`.

**Overlay points at the wrong place**
The v1 pointing is coordinate-based, so it's sensitive to layout shift between screenshot-time and render-time. The overlay auto-dismisses on any scroll/resize/click, which is the mitigation. If you see consistent misses, the model might be measuring from the wrong reference frame — file an issue with a screenshot.

## Deploying to Vercel

This app deploys as-is with the Vercel App Router adapter. On production, `VERCEL_OIDC_TOKEN` is auto-injected and used to authenticate with the AI Gateway — you do not need to set `AI_GATEWAY_API_KEY` in the Vercel dashboard.

```bash
vercel --cwd apps/demo
```
