import { z } from 'zod';

/**
 * Shape of the per-request page context that the pip widget sends alongside
 * the chat messages. This metadata never includes raw sensitive content —
 * the client redacts password fields, `[data-pip="redact"]` elements, and
 * dev-supplied selectors before the payload leaves the browser.
 */
export const PipPageContextSchema = z.object({
  url: z.string().url(),
  title: z.string().max(500),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    devicePixelRatio: z.number().positive().default(1),
  }),
  /**
   * A trimmed textual snapshot of interactive elements on the page. Intended
   * to give the LLM a semantic map alongside the screenshot.
   */
  redactedDom: z.string().max(50_000),
});

export type PipPageContext = z.infer<typeof PipPageContextSchema>;

/**
 * Full request body that `@pip-help/core` POSTs to the pip endpoint.
 *
 * `uiMessages` follows the AI SDK `UIMessage[]` shape. The most recent user
 * message is expected to carry the screenshot as a `file` part with
 * `mediaType: 'image/png'`. We validate it loosely here — the AI SDK
 * performs strict validation internally before passing to the agent.
 */
export const PipRequestSchema = z.object({
  uiMessages: z.array(z.unknown()),
  pageContext: PipPageContextSchema,
});

export type PipRequest = z.infer<typeof PipRequestSchema>;

/**
 * Inputs the agent passes to the dev's `getContext()` implementation so they
 * can retrieve docs, call an internal API, or run a vector search.
 */
export interface GetContextInput {
  /** The raw text of the user's most recent question, extracted from `uiMessages`. */
  query: string;
  /** The current page's URL. */
  url: string;
  /** Full page context for advanced routing. */
  pageContext: PipPageContext;
}

export type GetContextFn = (input: GetContextInput) => Promise<string> | string;

/**
 * Configuration passed to `createPipHandler`.
 */
export interface PipHandlerConfig {
  /**
   * The model to use. Pass an AI Gateway model string (recommended),
   * e.g. `'anthropic/claude-sonnet-4.6'`, or a direct provider model instance
   * for self-hosted / non-Gateway setups.
   */
  model: string | import('ai').LanguageModel;

  /**
   * Returns the contextual markdown blob that will be injected into the
   * system prompt. The default implementation reads a static file.
   */
  getContext: GetContextFn;

  /**
   * Optional extra instructions appended to the default system prompt.
   * Useful for tuning tone, constraining scope, or adding safety rails.
   */
  systemPromptExtra?: string;

  /**
   * Maximum number of steps the agent loop may run per request.
   * Defaults to 5 — enough for one `highlight` call followed by a text
   * explanation, with a small safety margin.
   */
  maxSteps?: number;

  /**
   * Optional extractor run on any error that escapes the agent stream.
   * The return value is sent to the client as the error message and
   * rendered in the chat bubble.
   *
   * If omitted, the AI SDK's default behavior runs: errors are masked to
   * a generic "An error occurred" string. This is the correct default
   * for production because provider errors can occasionally include API
   * key hints, full token URLs, or other secrets.
   *
   * Override this when you want richer error messages in development, or
   * when you want to log the full error to your observability stack and
   * return a stable error code to the client:
   *
   *   onError: (error) => {
   *     logToSentry(error);
   *     return error instanceof Error ? error.message : 'Unknown error';
   *   }
   */
  onError?: (error: unknown) => string;
}
