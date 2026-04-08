/**
 * UI message stream parser.
 *
 * The pip server returns an AI SDK v6 UI message stream: Server-Sent
 * Events where each event is a single `data: {...}` line containing a JSON
 * object, followed by a blank line. The stream terminates with
 * `data: [DONE]`.
 *
 * We roll our own SSE parser instead of leaning on `@ai-sdk/react` because
 * the widget is vanilla TS — we don't want to pull React (or any framework
 * runtime) into the client bundle for the sake of a 30-line parser.
 *
 * This file exposes a single `readUiMessageStream` async generator that
 * yields parsed events as they arrive. Consumers can `for await` over it.
 */

/**
 * The subset of AI SDK v6 UI message stream events the pip client cares
 * about. We treat anything we don't handle as `unknown` and skip it — the
 * AI SDK may add new event types in minor releases and we shouldn't crash
 * on events we don't recognize.
 */
export type UIStreamEvent =
  | { type: 'start'; messageId?: string }
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }
  | {
      type: 'tool-input-available';
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: 'tool-output-available';
      toolCallId: string;
      output: unknown;
    }
  | { type: 'finish' }
  | { type: 'error'; errorText: string }
  | { type: 'abort'; reason?: string }
  | { type: string; [key: string]: unknown };

/**
 * Read a `ReadableStream<Uint8Array>` (e.g., `response.body`) as a stream
 * of UI message events.
 *
 * Buffering behavior matches the SSE spec: events are delimited by blank
 * lines (`\n\n` or `\r\n\r\n`), `data:` is stripped from each line, and
 * multiple `data:` lines in a single event are concatenated with `\n`.
 *
 * The generator ends when:
 *   - A `[DONE]` marker arrives
 *   - The stream closes cleanly (EOF)
 *   - An error is thrown upstream (propagated to the consumer)
 */
export async function* readUiMessageStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<UIStreamEvent, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // Flush any trailing event without a blank line.
        const final = extractEvent(buffer);
        if (final) {
          const event = tryParseEvent(final);
          if (event) yield event;
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process every complete event (terminated by blank line).
      while (true) {
        const eventEnd = findEventBoundary(buffer);
        if (eventEnd === -1) break;
        const rawEvent = buffer.slice(0, eventEnd);
        buffer = buffer.slice(eventEnd).replace(/^(\r?\n)+/, '');
        const dataText = extractEvent(rawEvent);
        if (!dataText) continue;
        if (dataText === '[DONE]') return;
        const event = tryParseEvent(dataText);
        if (event) yield event;
      }
    }
  } finally {
    // Best-effort release; reader may already be closed.
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

/** Index where the current event ends (first `\n\n` or `\r\n\r\n`). */
function findEventBoundary(buffer: string): number {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1) return crlf === -1 ? -1 : crlf + 4;
  if (crlf === -1) return lf + 2;
  return (lf < crlf ? lf + 2 : crlf + 4);
}

/**
 * Extract the concatenated `data:` payload from a single SSE event block.
 * Returns `null` if the block contains no `data:` lines (e.g., a comment
 * or `event:` line we don't care about).
 */
function extractEvent(block: string): string | null {
  const lines = block.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^\s/, ''));
    }
  }
  if (dataLines.length === 0) return null;
  return dataLines.join('\n');
}

function tryParseEvent(jsonText: string): UIStreamEvent | null {
  if (jsonText === '[DONE]') return null;
  try {
    const parsed = JSON.parse(jsonText) as UIStreamEvent;
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.type === 'string') {
      return parsed;
    }
    return null;
  } catch {
    // Malformed line — skip it rather than killing the whole stream.
    return null;
  }
}
