/**
 * Public types for `@pip-help/core`.
 *
 * These are intentionally minimal in the shell — feature packages (capture,
 * overlay, transport, widget) will augment them as they land. Everything
 * here describes the public API surface that dev consumers touch.
 */

/**
 * Configuration accepted by `mount()`, or by the auto-mount script-tag
 * attribute parser. All fields are optional except `endpoint`.
 */
export interface PipConfig {
  /**
   * The URL of the dev's pip backend route — this is where the widget POSTs
   * chat turns. Typically `/api/pip` for a self-hosted Next.js setup.
   */
  endpoint: string;

  /**
   * CSS selectors that should be fully redacted before the page state is
   * sent to the LLM. Their text is stripped from the DOM snapshot and their
   * bounding rects are blacked out on the screenshot.
   *
   * `input[type="password"]` and `[data-pip="redact"]` are always redacted;
   * anything supplied here is added to that list.
   */
  redact?: string[];

  /**
   * If true, capture the outgoing payload and log it to `console.log`
   * instead of sending it over the network. Useful for auditing what pip
   * sees before shipping to production. Off by default.
   */
  debug?: boolean;

  /**
   * Custom hook that runs after redaction and right before the fetch. Gives
   * power users a chance to transform the payload — add headers, blur extra
   * regions, strip custom fields, etc.
   */
  beforeSend?: (payload: PipOutgoingPayload) => PipOutgoingPayload | Promise<PipOutgoingPayload>;

  /**
   * Override where the widget renders. Defaults to `document.body`. Rarely
   * needed; mostly exists for iframe hosts and testing.
   */
  mountTarget?: HTMLElement;
}

/**
 * The body posted to the pip endpoint. Shape matches the zod schema in
 * `@pip-help/server` — if you change one, change the other.
 */
export interface PipOutgoingPayload {
  uiMessages: PipUIMessageLike[];
  pageContext: {
    url: string;
    title: string;
    viewport: {
      width: number;
      height: number;
      devicePixelRatio: number;
    };
    redactedDom: string;
  };
}

/**
 * Loose shape of a UI message on the wire. We mirror the AI SDK's
 * `UIMessage` structure but don't depend on the `ai` package at build time
 * (keeps the widget bundle small). At runtime we pass these through
 * unchanged — the server validates them strictly.
 */
export interface PipUIMessageLike {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: PipMessagePart[];
}

export type PipMessagePart =
  | { type: 'text'; text: string }
  | { type: 'file'; mediaType: string; url: string }
  | { type: `tool-${string}`; toolCallId: string; state: string; input?: unknown; output?: unknown }
  | { type: string; [key: string]: unknown };

/**
 * The live pip instance returned by `mount()`. Gives programmatic access to
 * the widget for dev consumers who want to open/close it, prompt it with a
 * question, or tear it down.
 */
export interface PipInstance {
  /** Open the chat panel. */
  open(): void;
  /** Close the chat panel. */
  close(): void;
  /** Toggle the paused state (kill switch). */
  setPaused(paused: boolean): void;
  /** Whether pip is currently paused by the user. */
  isPaused(): boolean;
  /** Remove the widget from the DOM and clean up listeners. */
  destroy(): void;
  /** The resolved config this instance is using. */
  readonly config: Readonly<PipConfig>;
}
