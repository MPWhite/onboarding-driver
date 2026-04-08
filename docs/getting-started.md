# Getting started with pip

This guide walks through adding pip to your site end-to-end in about five minutes. You'll end up with a floating mouse in the corner of your page that answers questions about your product with a visual arrow pointing at whatever the user should click next.

## What you need

- A website you control (any framework, or plain HTML)
- A server-side runtime where you can add one route (Node, Next.js, Bun, Deno, Cloudflare Workers, etc.)
- A [Vercel AI Gateway](https://vercel.com/dashboard/ai-gateway) account — free tier is fine

---

## Step 1: install the packages

```bash
pnpm add @pip-help/core @pip-help/server ai zod
```

`ai` and `zod` are peer dependencies of `@pip-help/server` so you can pin the versions you want.

## Step 2: write your context markdown

Create a `pip.md` at your project root. This is the file pip reads on every chat turn to ground the model in your product. Keep it short — a few hundred words of "what does this site do, how is it laid out, what are the common flows" is enough to start.

```markdown
# Acme Projects

A project management dashboard.

## Layout

- **Left sidebar**: Projects, Teammates, Billing, Settings
- **Main area**: Project list with a "+ New project" button top-right
- **Filter chips** above the list: All / Active / Draft / Archived

## Common questions

- "How do I create a new project?" → point at the "+ New project" button in the header
- "Where do I manage billing?" → point at the "Billing" link in the left sidebar
```

See [`apps/demo/pip.md`](../apps/demo/pip.md) for a complete example.

## Step 3: add the backend route

### Next.js App Router

```ts
// app/api/pip/route.ts
import { createPipHandler, markdownFileContext } from '@pip-help/server/next';
import path from 'node:path';

export const POST = createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: markdownFileContext(path.join(process.cwd(), 'pip.md')),
});

export const maxDuration = 60;
```

### Any other fetch-based runtime

```ts
import { createPipHandler, markdownFileContext } from '@pip-help/server';

const handler = createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: markdownFileContext('./pip.md'),
});

// Hono:
app.post('/api/pip', (c) => handler(c.req.raw));

// Cloudflare Workers:
export default { fetch: handler };
```

`createPipHandler` returns a `(Request) => Promise<Response>` function. Whatever runtime you're in, wire that signature into your routing layer.

## Step 4: configure the AI Gateway

### On Vercel

Nothing to do — `VERCEL_OIDC_TOKEN` is auto-injected on every deployment, and the AI SDK uses it automatically.

### Locally

Create an `.env.local` in your project:

```bash
AI_GATEWAY_API_KEY=your-key-here
```

Get a key at <https://vercel.com/dashboard/ai-gateway/api-keys>. Or, if your project is already linked to a Vercel project, run:

```bash
vercel env pull .env.local
```

to pull a 12-hour OIDC token plus any other env vars you have set.

## Step 5: add the widget to your pages

### Option A — script tag (any HTML page)

```html
<script
  src="https://unpkg.com/@pip-help/core/dist/iife.js"
  data-pip-endpoint="/api/pip"
></script>
```

Drop that into the `<head>` or before `</body>` of any page. The widget self-mounts on `DOMContentLoaded`.

### Option B — NPM auto-mount

```ts
// app/layout.tsx (Next.js) or your root entry file
import '@pip-help/core/auto';
```

### Option C — explicit mount (React / SPA)

```tsx
// PipMount.tsx
'use client';
import { useEffect } from 'react';
import { mount } from '@pip-help/core';

export function PipMount() {
  useEffect(() => {
    mount({ endpoint: '/api/pip' });
  }, []);
  return null;
}
```

Then render `<PipMount />` once in your root layout. Double-mounts are a no-op, so React Strict Mode is safe.

## Step 6: try it

Start your app. A mouse icon appears in the bottom-right corner. Click it, accept the consent dialog, and ask something like:

> How do I create a new project?

You should see:

1. A text answer streaming into a chat bubble
2. A dimmed backdrop fading over the page
3. An SVG ring highlighting the button you asked about
4. A caption bubble next to the ring

Click anywhere (or scroll, or press Escape) to dismiss the highlight.

---

## Next steps

- **Redact sensitive fields** — add `redact: ['.customer-email']` to your `mount()` config, or mark elements with `data-pip="redact"`. See [`docs/api/client-config.md`](api/client-config.md).
- **Customize the context dynamically** — replace `markdownFileContext()` with your own `getContext` function that can hit a vector store, an internal API, or per-user personalization. See [`docs/api/server-config.md`](api/server-config.md).
- **Read the architecture** — the [v1 design doc](design/2026-04-07-v1-design.md) walks through how capture, redaction, streaming, and the highlight tool fit together.
- **Run the demo locally** — see [`apps/demo/README.md`](../apps/demo/README.md).

## Troubleshooting

**"pip server error 500"** — usually the AI Gateway key is missing or invalid. Check `.env.local` and restart the dev server.

**Widget doesn't appear** — open DevTools and look for `[pip]` logs. In debug mode (`debug: true` in your config) the widget logs to `console`. If you see `auto-mount skipped: no config found`, your script tag is missing `data-pip-endpoint`, or `mount()` isn't being called.

**Overlay points at the wrong spot** — the v1 pointing is coordinate-based, so layout shift between screenshot-time and render-time can cause misses. The overlay auto-dismisses on scroll/resize, which is the mitigation. Consistent misses usually mean the model is measuring from the wrong reference frame — file an issue with a screenshot.

**Password field visible in dev tools' network tab** — that's a bug, please file it. Password fields are supposed to be blacked out client-side before the fetch. See [`docs/api/client-config.md`](api/client-config.md) for the full redaction story.
