# @pip-help/server

Backend adapter for [pip](https://github.com/MPWhite/onboarding-driver). A thin wrapper around the [Vercel AI SDK v6](https://sdk.vercel.ai) that answers contextual help questions from the [`@pip-help/core`](https://www.npmjs.com/package/@pip-help/core) widget.

## Install

```bash
pnpm add @pip-help/server ai zod
```

`ai` and `zod` are peer dependencies you install yourself so you can pin the versions you want.

## Usage — Next.js App Router

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

That's the entire integration for the default case. `createPipHandler` returns a function whose signature matches Next's `POST` route handler contract — no adapter layer needed.

The `anthropic/claude-sonnet-4.6` string is a Vercel AI Gateway model identifier. On Vercel deployments, OIDC auth kicks in automatically. For local dev, set `AI_GATEWAY_API_KEY` in `.env.local` or run `vercel env pull .env.local`.

## Usage — any fetch-based runtime

`createPipHandler` produces a `(request: Request) => Promise<Response>` function, so it drops into any runtime that speaks the fetch standard:

```ts
import { createPipHandler, markdownFileContext } from '@pip-help/server';

const handler = createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: markdownFileContext('./pip.md'),
});

// Hono:
app.post('/api/pip', (c) => handler(c.req.raw));

// Cloudflare Workers / Deno / Bun:
export default { fetch: handler };

// Vercel Functions / edge-compatible runtimes:
export default handler;
```

## Dynamic context

`getContext` is called on every chat turn. The default helper reads a markdown file. Swap it for anything — vector search, an internal API, user-specific personalization:

```ts
export const POST = createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: async ({ query, url, pageContext }) => {
    const chunks = await myVectorStore.search(query, { topK: 5 });
    return chunks.map((c) => c.content).join('\n\n');
  },
});
```

`getContext` receives:

- `query` — the user's most recent question, extracted from the conversation
- `url` — the full URL of the current page
- `pageContext` — the full page metadata (title, viewport, redacted DOM snapshot)

It must return a string that will be injected into the system prompt.

## Config

```ts
interface PipHandlerConfig {
  /** An AI Gateway model string (e.g. 'anthropic/claude-sonnet-4.6') or
   *  a direct AI SDK LanguageModel instance for self-hosted/non-Gateway setups. */
  model: string | LanguageModel;

  /** Returns the contextual markdown for a chat turn. */
  getContext: GetContextFn;

  /** Extra instructions appended to the default system prompt. */
  systemPromptExtra?: string;

  /** Maximum agent loop steps. Defaults to 5. */
  maxSteps?: number;
}
```

See [`docs/api/server-config.md`](https://github.com/MPWhite/onboarding-driver/blob/main/docs/api/server-config.md) for the full reference.

## What it does under the hood

1. Parses and validates the incoming `PipRequest` (zod schema — 400 on malformed payloads).
2. Calls your `getContext({ query, url, pageContext })` to build the contextual markdown.
3. Constructs a fresh `ToolLoopAgent` with:
   - System prompt = fixed instructions + your context + current page metadata (URL, title, viewport, redacted DOM)
   - A single tool — `highlight` — with a Zod `inputSchema` for `{ x, y, width, height, caption }`
4. Returns `createAgentUIStreamResponse({ agent, uiMessages })` — a streaming `Response` with the AI SDK v6 UI message stream the client parses directly.

The `highlight` tool has a trivial `execute` that returns `{ highlighted: true }`, which lets the agent loop continue past the tool call to stream a text explanation afterwards.

## Types

Full end-to-end type safety via `InferAgentUIMessage`:

```ts
import type { PipUIMessage } from '@pip-help/server';
// PipUIMessage includes a typed `tool-highlight` part with the exact
// input schema you'd get from the server.
```

## License

MIT — see the [repo LICENSE](https://github.com/MPWhite/onboarding-driver/blob/main/LICENSE).
