import { describe, it, expect } from 'vitest';
import { readUiMessageStream, type UIStreamEvent } from './stream.js';

/**
 * The SSE parser has a few edge cases that a live integration test would
 * never hit reliably:
 *
 *   - Events split across multiple chunks (network frame boundaries)
 *   - Multiple events in one chunk (backend flush behavior)
 *   - Trailing event without a terminating blank line
 *   - [DONE] marker stopping the stream
 *   - Malformed JSON that should be skipped, not crash
 *
 * Each deserves its own test. We build ReadableStreams manually from
 * Uint8Array chunks so we can control the exact buffering behavior.
 */

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]!));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<UIStreamEvent[]> {
  const events: UIStreamEvent[] = [];
  for await (const event of readUiMessageStream(stream)) {
    events.push(event);
  }
  return events;
}

describe('readUiMessageStream', () => {
  it('parses a single complete event', async () => {
    const stream = makeStream([
      'data: {"type":"text-delta","id":"m1","delta":"Hello"}\n\n',
    ]);
    const events = await drain(stream);
    expect(events).toEqual([
      { type: 'text-delta', id: 'm1', delta: 'Hello' },
    ]);
  });

  it('parses multiple events in one chunk', async () => {
    const stream = makeStream([
      'data: {"type":"text-start","id":"m1"}\n\n' +
        'data: {"type":"text-delta","id":"m1","delta":"Hi"}\n\n' +
        'data: {"type":"text-end","id":"m1"}\n\n',
    ]);
    const events = await drain(stream);
    expect(events.map((e) => e.type)).toEqual([
      'text-start',
      'text-delta',
      'text-end',
    ]);
  });

  it('buffers events split across chunks', async () => {
    const stream = makeStream([
      'data: {"type":"text-de',
      'lta","id":"m1","delta":"Hel',
      'lo"}\n\n',
    ]);
    const events = await drain(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'text-delta', delta: 'Hello' });
  });

  it('handles event boundary split across chunks', async () => {
    const stream = makeStream([
      'data: {"type":"text-delta","id":"m1","delta":"A"}\n',
      '\ndata: {"type":"text-delta","id":"m1","delta":"B"}\n\n',
    ]);
    const events = await drain(stream);
    expect(events).toHaveLength(2);
    expect((events[0] as { delta: string }).delta).toBe('A');
    expect((events[1] as { delta: string }).delta).toBe('B');
  });

  it('handles CRLF line endings', async () => {
    const stream = makeStream([
      'data: {"type":"text-delta","id":"m1","delta":"CR"}\r\n\r\n',
    ]);
    const events = await drain(stream);
    expect(events).toHaveLength(1);
    expect((events[0] as { delta: string }).delta).toBe('CR');
  });

  it('stops at the [DONE] marker and ignores anything after', async () => {
    const stream = makeStream([
      'data: {"type":"text-delta","id":"m1","delta":"Hi"}\n\n' +
        'data: [DONE]\n\n' +
        'data: {"type":"text-delta","id":"m1","delta":"IGNORED"}\n\n',
    ]);
    const events = await drain(stream);
    expect(events).toHaveLength(1);
    expect((events[0] as { delta: string }).delta).toBe('Hi');
  });

  it('flushes a trailing event without a terminating blank line', async () => {
    const stream = makeStream([
      'data: {"type":"text-delta","id":"m1","delta":"Trail"}\n\n' +
        'data: {"type":"finish"}',
    ]);
    const events = await drain(stream);
    // Both events should be delivered even though the last one lacks \n\n
    expect(events.map((e) => e.type)).toEqual(['text-delta', 'finish']);
  });

  it('skips malformed JSON without aborting the stream', async () => {
    const stream = makeStream([
      'data: {"type":"text-delta","id":"m1","delta":"ok"}\n\n' +
        'data: {this is not json}\n\n' +
        'data: {"type":"finish"}\n\n',
    ]);
    const events = await drain(stream);
    expect(events.map((e) => e.type)).toEqual(['text-delta', 'finish']);
  });

  it('parses tool-input-available events', async () => {
    const stream = makeStream([
      'data: {"type":"tool-input-available","toolCallId":"tc1","toolName":"highlight","input":{"x":100,"y":200,"width":50,"height":30,"caption":"Click here"}}\n\n',
    ]);
    const events = await drain(stream);
    expect(events).toHaveLength(1);
    const ev = events[0] as {
      type: string;
      toolName: string;
      input: { x: number; caption: string };
    };
    expect(ev.type).toBe('tool-input-available');
    expect(ev.toolName).toBe('highlight');
    expect(ev.input.x).toBe(100);
    expect(ev.input.caption).toBe('Click here');
  });

  it('ignores SSE comment lines (colon-prefixed) and event: lines', async () => {
    const stream = makeStream([
      ': keep-alive ping\n\n' +
        'event: custom\ndata: {"type":"text-delta","id":"m1","delta":"X"}\n\n',
    ]);
    const events = await drain(stream);
    expect(events).toHaveLength(1);
    expect((events[0] as { delta: string }).delta).toBe('X');
  });

  it('concatenates multi-line data fields with newlines', async () => {
    const stream = makeStream([
      'data: {"type":"text-delta","id":"m1",\n' +
        'data: "delta":"Hi"}\n\n',
    ]);
    const events = await drain(stream);
    expect(events).toHaveLength(1);
    expect((events[0] as { delta: string }).delta).toBe('Hi');
  });

  it('handles empty stream cleanly', async () => {
    const stream = makeStream([]);
    const events = await drain(stream);
    expect(events).toEqual([]);
  });
});
