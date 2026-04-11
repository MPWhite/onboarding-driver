/**
 * Transport controller — the glue between the mouse widget, capture, the
 * network fetch, and the pointing overlay.
 *
 * Each call to `send(text)`:
 *
 *   1. Appends a user message to local conversation history.
 *   2. Runs the capture pipeline (screenshot + DOM snapshot + redaction).
 *   3. Builds the outgoing payload in the shape the server expects.
 *   4. Runs the dev's `beforeSend` hook if one was configured, giving them
 *      a last chance to transform/scrub the payload.
 *   5. Optionally logs the payload to the console instead of sending, if
 *      `config.debug` is enabled.
 *   6. POSTs the payload to the dev's endpoint and reads the UI message
 *      stream.
 *   7. Dispatches text-delta events to the active assistant turn (which
 *      streams into the mouse's speech bubble), and tool-input-available
 *      events for `highlight` to the overlay AND the mouse (so the cursor
 *      walks to the target).
 *   8. On finish/error, closes the turn and unlocks the input.
 *
 * All errors are surfaced via `turn.error(message)` — the widget should
 * never throw into the host page.
 */

import { capturePage } from '../capture/index.js';
import type { MouseHandle } from '../widget/mouse.js';
import type { AssistantTurnHandle } from '../widget/assistant-turn.js';
import type { OverlayHandle } from '../overlay/index.js';
import type { PipConfig, PipOutgoingPayload, PipUIMessageLike } from '../types.js';
import { readUiMessageStream, type UIStreamEvent } from './stream.js';

export interface TransportController {
  send(text: string): Promise<void>;
  reset(): void;
  abort(): void;
}

export interface CreateTransportOptions {
  config: PipConfig;
  mouse: MouseHandle;
  overlay: OverlayHandle;
}

export function createTransport({
  config,
  mouse,
  overlay,
}: CreateTransportOptions): TransportController {
  // Conversation history in UIMessage format. We keep screenshots OUT of
  // history after the turn finishes to avoid resending them on every
  // follow-up — the latest turn always re-captures fresh. Older turns are
  // stored text-only, which dramatically cuts prompt size.
  const history: PipUIMessageLike[] = [];

  let inFlight: AbortController | null = null;

  async function send(text: string): Promise<void> {
    if (inFlight) {
      // Don't stack concurrent requests — drop the new send quietly. The
      // mouse's setSending(true) lock should prevent this anyway, but
      // programmatic callers (instance.open, tests) might hit this path.
      return;
    }

    // Close any active highlight overlay from a previous turn — we're
    // moving on to a new question. The mouse returns home so the cursor
    // is visibly "resetting" before the next answer lands.
    overlay.hide();
    mouse.returnHome();

    // 1. Add the user turn to history + UI.
    const userMessage: PipUIMessageLike = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      parts: [{ type: 'text', text }],
    };
    history.push(userMessage);
    mouse.addUserMessage(text);

    mouse.setSending(true);
    const turn = mouse.startAssistantTurn();

    let assistantText = '';
    const assistantMessageId = `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const abort = new AbortController();
    inFlight = abort;

    try {
      // 2. Capture the page.
      const capture = await capturePage(config);

      // 3. Build the payload. Attach the screenshot as a file part on the
      //    user message that goes on the wire — we don't mutate history to
      //    keep older turns lean.
      const wireUserMessage: PipUIMessageLike = {
        ...userMessage,
        parts: [
          { type: 'text', text },
          { type: 'file', mediaType: 'image/png', url: capture.screenshot },
        ],
      };
      const uiMessages = [...history.slice(0, -1), wireUserMessage];

      let payload: PipOutgoingPayload = {
        uiMessages,
        pageContext: {
          url: capture.url,
          title: capture.title,
          viewport: capture.viewport,
          redactedDom: capture.dom,
        },
      };

      // 4. Dev hook.
      if (config.beforeSend) {
        payload = await config.beforeSend(payload);
      }

      // 5. Debug mode — log and short-circuit without sending.
      //    This is the entire point of debug mode: give devs a way to
      //    audit exactly what pip would ship BEFORE they ship it to
      //    production. If we sent anyway, debug mode would be a
      //    diagnostic log with no safety value.
      if (config.debug) {
        console.log('[pip] outgoing payload (debug mode — not sent):', payload);
        turn.appendText(
          '(debug mode: request not sent. See console for the payload that would have been posted.)',
        );
        turn.finish();
        return;
      }

      // 6. Fetch + stream.
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify(payload),
        signal: abort.signal,
      });

      if (!response.ok) {
        const detail = await safeReadErrorBody(response);
        throw new Error(`pip server error ${response.status}: ${detail}`);
      }

      if (!response.body) {
        throw new Error('pip server returned no response body');
      }

      // 7. Consume the UI message stream.
      for await (const event of readUiMessageStream(response.body)) {
        handleEvent(event, turn, overlay, mouse, (delta) => {
          assistantText += delta;
        });
      }

      turn.finish();

      // 8. Append the assistant turn to history for follow-up context.
      if (assistantText.length > 0) {
        history.push({
          id: assistantMessageId,
          role: 'assistant',
          parts: [{ type: 'text', text: assistantText }],
        });
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        turn.finish();
      } else {
        const message = error instanceof Error ? error.message : String(error);
        turn.error(message);
      }
    } finally {
      mouse.setSending(false);
      inFlight = null;
    }
  }

  function reset(): void {
    history.length = 0;
  }

  function abort(): void {
    inFlight?.abort();
  }

  return { send, reset, abort };
}

/** Apply a single UI stream event to the mouse + overlay. */
function handleEvent(
  event: UIStreamEvent,
  turn: AssistantTurnHandle,
  overlay: OverlayHandle,
  mouse: MouseHandle,
  onTextDelta: (delta: string) => void,
): void {
  switch (event.type) {
    case 'text-delta': {
      const delta = typeof event.delta === 'string' ? event.delta : '';
      if (delta) {
        turn.appendText(delta);
        onTextDelta(delta);
      }
      return;
    }
    case 'tool-input-available': {
      if (event.toolName === 'highlight') {
        const input = event.input;
        if (isHighlightInput(input)) {
          // Walk the cursor to the target center, then render the overlay
          // backdrop + ring. The mouse owns the speech bubble (caption),
          // so we suppress the overlay's own caption to avoid double-
          // rendering the same text in two places.
          mouse.moveTo(input.x + input.width / 2, input.y + input.height / 2);
          overlay.show(input, { renderCaption: false });
        }
      }
      return;
    }
    case 'error': {
      const message =
        typeof event.errorText === 'string' ? event.errorText : 'stream error';
      turn.error(message);
      return;
    }
    // Events we acknowledge but don't act on:
    case 'start':
    case 'text-start':
    case 'text-end':
    case 'tool-output-available':
    case 'finish':
    case 'abort':
      return;
    default:
      return;
  }
}

function isHighlightInput(
  input: unknown,
): input is { x: number; y: number; width: number; height: number; caption: string } {
  if (typeof input !== 'object' || input === null) return false;
  const obj = input as Record<string, unknown>;
  return (
    typeof obj['x'] === 'number' &&
    typeof obj['y'] === 'number' &&
    typeof obj['width'] === 'number' &&
    typeof obj['height'] === 'number' &&
    typeof obj['caption'] === 'string'
  );
}

async function safeReadErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return response.statusText || 'unknown error';
  }
}
