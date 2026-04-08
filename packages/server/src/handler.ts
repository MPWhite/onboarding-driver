import { createAgentUIStreamResponse } from 'ai';
import { buildPipAgent } from './agent.js';
import { buildSystemPrompt } from './prompt.js';
import { PipRequestSchema, type PipHandlerConfig, type PipRequest } from './types.js';

/**
 * Create a framework-agnostic pip request handler.
 *
 * The returned function accepts a standard `Request` and returns a streaming
 * `Response` containing a Vercel AI SDK UI message stream. It works with any
 * runtime that speaks the fetch Request/Response contract:
 *
 *   - Next.js App Router route handlers (`export const POST = createPipHandler(...)`)
 *   - Hono, Bun, Deno, Cloudflare Workers (`app.post('/api/pip', createPipHandler(...))`)
 *   - Fluid Compute / Vercel Functions
 *
 * For Express/Fastify/Node HTTP you'll want a small adapter that converts
 * the Node request to a fetch Request first — not shipped in v1.
 *
 * @example
 *   // app/api/pip/route.ts
 *   import { createPipHandler, markdownFileContext } from '@pip-help/server';
 *
 *   export const POST = createPipHandler({
 *     model: 'anthropic/claude-sonnet-4.6',
 *     getContext: markdownFileContext('./pip.md'),
 *   });
 */
export function createPipHandler(config: PipHandlerConfig) {
  return async function pipHandler(request: Request): Promise<Response> {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonError(400, 'Request body must be valid JSON');
    }

    const parsed = PipRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(400, 'Invalid pip request payload', {
        issues: parsed.error.issues,
      });
    }

    const { uiMessages, pageContext } = parsed.data;

    const contextMarkdown = await runGetContext(config, parsed.data);
    const instructions = buildSystemPrompt({
      contextMarkdown,
      pageContext,
      extra: config.systemPromptExtra,
    });

    const agent = buildPipAgent({
      model: config.model,
      instructions,
      maxSteps: config.maxSteps,
    });

    return createAgentUIStreamResponse({
      agent,
      uiMessages,
      abortSignal: request.signal,
      // Only pass `onError` if the dev supplied one — otherwise let the
      // AI SDK use its default masking ("An error occurred"), which is
      // the secure default because raw provider errors can contain
      // API-key hints, URLs with tokens, or other secrets.
      ...(config.onError ? { onError: config.onError } : {}),
    });
  };
}

async function runGetContext(
  config: PipHandlerConfig,
  req: PipRequest,
): Promise<string> {
  const query = extractLatestUserText(req.uiMessages);
  try {
    const result = await config.getContext({
      query,
      url: req.pageContext.url,
      pageContext: req.pageContext,
    });
    return typeof result === 'string' ? result : '';
  } catch (error) {
    // Don't take down the whole request if the dev's getContext throws —
    // fall back to an empty context and let the model answer from the
    // screenshot alone.
    console.error('[pip] getContext threw:', error);
    return '(context retrieval failed; answering from screenshot only)';
  }
}

/**
 * Find the last user message in a `UIMessage[]` and concatenate its text
 * parts. Used to build the `query` arg for `getContext()`.
 */
function extractLatestUserText(uiMessages: unknown[]): string {
  for (let i = uiMessages.length - 1; i >= 0; i--) {
    const msg = uiMessages[i];
    if (!isObject(msg)) continue;
    if (msg.role !== 'user') continue;
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    const text = parts
      .filter(
        (p): p is { type: 'text'; text: string } =>
          isObject(p) && p.type === 'text' && typeof p.text === 'string',
      )
      .map((p) => p.text)
      .join(' ')
      .trim();
    if (text.length > 0) return text;
  }
  return '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function jsonError(
  status: number,
  message: string,
  extra?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
