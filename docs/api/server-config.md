# `@pip-help/server` — server config reference

The shape of the config object passed to `createPipHandler()`, and what each option does.

```ts
import { createPipHandler, markdownFileContext } from '@pip-help/server';

const handler = createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: markdownFileContext('./pip.md'),
  systemPromptExtra: 'Always respond in French.',
  maxSteps: 5,
});
```

## `model` *(required)*

**Type:** `string | LanguageModel`

Either:

- **A Vercel AI Gateway model string** (recommended) — e.g. `'anthropic/claude-sonnet-4.6'`, `'openai/gpt-5.2'`, `'google/gemini-2.5-pro'`. The AI SDK routes through the Gateway by default, giving you provider-agnostic model switching and zero-data-retention defaults. Auth is automatic on Vercel deployments (OIDC); local dev needs `AI_GATEWAY_API_KEY` in `.env.local`.

- **A direct AI SDK `LanguageModel` instance** — for self-hosted, air-gapped, or non-Gateway setups. Install the provider SDK (`@ai-sdk/anthropic`, `@ai-sdk/openai`, etc.) and pass the constructed model:

  ```ts
  import { anthropic } from '@ai-sdk/anthropic';

  createPipHandler({
    model: anthropic('claude-sonnet-4-6'),
    getContext: markdownFileContext('./pip.md'),
  });
  ```

**Find current model IDs** — always verify against the Gateway catalog rather than memory:

```bash
curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("anthropic/")) | .id] | reverse | .[]'
```

## `getContext` *(required)*

**Type:** `(input: GetContextInput) => string | Promise<string>`

Called on every chat turn to produce the contextual markdown that gets injected into the system prompt. The return value is stitched directly into the prompt under a `## About this site` heading.

**Input:**

```ts
interface GetContextInput {
  /** The latest user question, extracted from the chat history. Empty
   *  string if there's no text-part user message yet. */
  query: string;

  /** The current page URL. */
  url: string;

  /** The full page metadata as sent by the client. */
  pageContext: {
    url: string;
    title: string;
    viewport: { width: number; height: number; devicePixelRatio: number };
    redactedDom: string;
  };
}
```

### Default: read a markdown file

```ts
import { markdownFileContext } from '@pip-help/server';

createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: markdownFileContext('./pip.md'),
});
```

`markdownFileContext(filePath)` returns a `GetContextFn` that reads the file on every call (no caching — hot edits during dev just work). If the file doesn't exist, it returns a placeholder instead of throwing.

### Dynamic: vector search

```ts
import { createPipHandler } from '@pip-help/server';
import { myVectorStore } from './rag';

createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: async ({ query }) => {
    const chunks = await myVectorStore.search(query, { topK: 5 });
    return chunks.map((c) => c.content).join('\n\n---\n\n');
  },
});
```

### Dynamic: route by URL path

```ts
createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: async ({ url }) => {
    const path = new URL(url).pathname;
    if (path.startsWith('/billing')) return readFileSync('./docs/billing.md', 'utf-8');
    if (path.startsWith('/settings')) return readFileSync('./docs/settings.md', 'utf-8');
    return readFileSync('./docs/general.md', 'utf-8');
  },
});
```

### Dynamic: per-user from your database

```ts
createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: async ({ pageContext }) => {
    // (You'd extract the user ID from a cookie on the real Request elsewhere —
    // getContext doesn't receive request headers directly in v1.)
    const plan = await db.getUserPlan(userId);
    const base = readFileSync('./pip.md', 'utf-8');
    return `${base}\n\n## This user's plan\n\n${plan.description}`;
  },
});
```

**Error handling:** if `getContext` throws, the handler catches it, logs `[pip] getContext threw: <error>` to `console.error`, and falls back to the string `"(context retrieval failed; answering from screenshot only)"`. The chat turn proceeds — pip never fails a whole request because of a missing context document.

## `systemPromptExtra`

**Type:** `string`
**Default:** *(none)*

Extra instructions appended to the base system prompt under `## Additional instructions`. Useful for:

- Tone tweaks (`"Always respond in French."`, `"Use emoji liberally."`)
- Scope guardrails (`"If the user asks about billing, tell them to email support@example.com instead."`)
- Persona (`"You are pip, but talk like a tired sysadmin."`)

Empty and whitespace-only strings are ignored (the `## Additional instructions` section is not emitted).

## `maxSteps`

**Type:** `number`
**Default:** `5`

Upper bound on the agent loop. Each step is one LLM generation — text output OR a tool call. The loop ends when the model produces text, when a no-execute tool is called, or when `maxSteps` is hit.

For pip's v1 scope (one `highlight` tool call + one text response), the realistic maximum is 2. `5` is a safety margin; lower it to `2` or `3` if you want to cap costs aggressively and don't care about follow-up tool calls in a single turn.

---

## How the handler works, end to end

1. **Parse the body.** The incoming `Request` body is parsed as JSON. Non-JSON → 400.
2. **Validate.** The parsed body is run through `PipRequestSchema` (a Zod schema for `{ uiMessages, pageContext }`). Fails → 400 with the Zod issues in the response body.
3. **Build the system prompt.** Base instructions + `await getContext(...)` output + page metadata + `systemPromptExtra`. See [`buildSystemPrompt`](../../packages/server/src/prompt.ts) for the exact layout.
4. **Construct the agent.** A fresh `ToolLoopAgent` is created per request with the system prompt and the `highlight` tool. Construction is cheap (it's a config holder).
5. **Stream.** Returns `createAgentUIStreamResponse({ agent, uiMessages, abortSignal })` — a streaming `Response` using the AI SDK v6 UI message stream protocol.
6. **Client abort.** If the browser closes the connection, the handler's `request.signal` triggers the abort, which propagates into the LLM request and cancels any in-flight generation.

## The `highlight` tool

Defined in [`packages/server/src/tools.ts`](../../packages/server/src/tools.ts). Signature:

```ts
tool({
  description: 'Highlight an element on the page to point at it.',
  inputSchema: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    caption: z.string().min(1).max(140),
  }),
  execute: async () => ({ highlighted: true as const }),
});
```

Coordinates are viewport-relative CSS pixels (0,0 = top-left of what the user sees), measured from the screenshot the model has in context. The trivial `execute` return value exists so the agent loop **continues** past the tool call — the model typically streams a text explanation *after* the highlight arrives on the client, which is why you see "answer → arrow appears" in that order on screen.

## Types

Everything exported from `@pip-help/server`:

```ts
import type {
  PipHandlerConfig,
  PipRequest,
  PipPageContext,
  GetContextFn,
  GetContextInput,
  PipAgent,
  PipUIMessage,
  PipTools,
} from '@pip-help/server';
```

`PipUIMessage` is the inferred end-to-end type for the AI SDK v6 `UIMessage` produced by this agent, including the typed `tool-highlight` tool part. Use it in your client code for full type safety:

```ts
import type { PipUIMessage } from '@pip-help/server';
// (Server-safe type — use it in either client or server code.)
```
