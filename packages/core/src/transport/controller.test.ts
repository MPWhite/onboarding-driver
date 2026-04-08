import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTransport } from './controller.js';
import type { ChatPanelHandle, AssistantTurnHandle } from '../widget/chat-panel.js';
import type { OverlayHandle } from '../overlay/index.js';
import type { PipConfig } from '../types.js';

/**
 * Tests for the transport controller — the layer that glues chat UI,
 * page capture, network fetch, stream parsing, and the overlay.
 *
 * We mock the capture module so these tests don't touch html-to-image,
 * and mock global fetch so they don't touch the network. Panel and
 * overlay are fake objects with vi.fn() spies on every method we care
 * about. That lets us assert the exact call ordering the controller
 * should produce for each scenario.
 */

// Mock the capture module — returns a deterministic fake page state so
// the transport can build its payload without touching any real DOM.
vi.mock('../capture/index.js', () => ({
  capturePage: vi.fn(async () => ({
    screenshot: 'data:image/png;base64,FAKE',
    dom: '[button] "Go" @ (10, 20, 30, 40)',
    url: 'https://example.com/page',
    title: 'Example',
    viewport: { width: 800, height: 600, devicePixelRatio: 1 },
  })),
}));

// Re-import after mock so we can control its behavior per-test
import { capturePage } from '../capture/index.js';

/** Build a fake ChatPanelHandle with spies on every method. */
function fakePanel(): ChatPanelHandle & { turn: AssistantTurnHandle & { appendText: ReturnType<typeof vi.fn>; finish: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } } {
  const turn = {
    appendText: vi.fn(),
    finish: vi.fn(),
    error: vi.fn(),
  };
  const panel: ChatPanelHandle = {
    element: document.createElement('div'),
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
    focusInput: vi.fn(),
    setPaused: vi.fn(),
    setSending: vi.fn(),
    addUserMessage: vi.fn(),
    startAssistantTurn: vi.fn(() => turn),
  };
  return Object.assign(panel, { turn });
}

function fakeOverlay(): OverlayHandle {
  return {
    element: document.createElement('div'),
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
    destroy: vi.fn(),
  };
}

/** Build a `Response` whose body streams the given SSE event lines. */
function sseResponse(events: string[], status = 200): Response {
  const body = events.join('');
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function sseLine(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

const baseConfig: PipConfig = {
  endpoint: '/api/pip',
  redact: [],
  debug: false,
};

describe('createTransport', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    vi.mocked(capturePage).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: captures, posts, streams text into the active turn', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        sseLine({ type: 'text-start', id: 'm1' }),
        sseLine({ type: 'text-delta', id: 'm1', delta: 'Hi ' }),
        sseLine({ type: 'text-delta', id: 'm1', delta: 'there' }),
        sseLine({ type: 'text-end', id: 'm1' }),
        sseLine({ type: 'finish' }),
      ]),
    );

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    await transport.send('how do I create a project?');

    // User message rendered + turn started + deltas streamed + finished
    expect(panel.addUserMessage).toHaveBeenCalledWith(
      'how do I create a project?',
    );
    expect(panel.setSending).toHaveBeenCalledWith(true);
    expect(panel.startAssistantTurn).toHaveBeenCalledOnce();
    expect(panel.turn.appendText).toHaveBeenCalledWith('Hi ');
    expect(panel.turn.appendText).toHaveBeenCalledWith('there');
    expect(panel.turn.finish).toHaveBeenCalledOnce();
    expect(panel.turn.error).not.toHaveBeenCalled();
    expect(panel.setSending).toHaveBeenLastCalledWith(false);
  });

  it('posts the screenshot as a file part on the outgoing user message', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse([sseLine({ type: 'finish' })]),
    );

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    await transport.send('hello');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.uiMessages).toHaveLength(1);
    const msg = body.uiMessages[0];
    expect(msg.role).toBe('user');
    expect(msg.parts).toHaveLength(2);
    expect(msg.parts[0]).toEqual({ type: 'text', text: 'hello' });
    expect(msg.parts[1]).toEqual({
      type: 'file',
      mediaType: 'image/png',
      url: 'data:image/png;base64,FAKE',
    });
    expect(body.pageContext).toEqual({
      url: 'https://example.com/page',
      title: 'Example',
      viewport: { width: 800, height: 600, devicePixelRatio: 1 },
      redactedDom: '[button] "Go" @ (10, 20, 30, 40)',
    });
  });

  it('dispatches highlight tool calls to overlay.show with the input', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        sseLine({ type: 'text-delta', id: 'm1', delta: 'Click here!' }),
        sseLine({
          type: 'tool-input-available',
          toolCallId: 'tc1',
          toolName: 'highlight',
          input: { x: 100, y: 200, width: 50, height: 30, caption: 'Start here' },
        }),
        sseLine({ type: 'finish' }),
      ]),
    );

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    await transport.send('where?');

    expect(overlay.show).toHaveBeenCalledOnce();
    expect(overlay.show).toHaveBeenCalledWith({
      x: 100,
      y: 200,
      width: 50,
      height: 30,
      caption: 'Start here',
    });
  });

  it('ignores highlight tool calls with malformed inputs', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        sseLine({
          type: 'tool-input-available',
          toolCallId: 'tc1',
          toolName: 'highlight',
          input: { x: 'not a number', y: 200, width: 50 }, // missing fields + wrong type
        }),
        sseLine({ type: 'finish' }),
      ]),
    );

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    await transport.send('?');

    expect(overlay.show).not.toHaveBeenCalled();
  });

  it('ignores tool calls for unrecognized tool names', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        sseLine({
          type: 'tool-input-available',
          toolCallId: 'tc1',
          toolName: 'someOtherTool',
          input: { x: 1, y: 2, width: 3, height: 4, caption: 'x' },
        }),
        sseLine({ type: 'finish' }),
      ]),
    );

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    await transport.send('?');

    expect(overlay.show).not.toHaveBeenCalled();
  });

  it('hides any existing highlight when a new turn starts', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse([sseLine({ type: 'finish' })]),
    );
    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });
    await transport.send('hello');
    expect(overlay.hide).toHaveBeenCalled();
  });

  it('surfaces HTTP error status in turn.error', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Invalid pip request payload', { status: 400 }),
    );

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    await transport.send('hi');

    expect(panel.turn.error).toHaveBeenCalledOnce();
    const [msg] = panel.turn.error.mock.calls[0]!;
    expect(msg).toContain('400');
    expect(panel.turn.finish).not.toHaveBeenCalled();
    expect(panel.setSending).toHaveBeenLastCalledWith(false);
  });

  it('surfaces fetch network failures in turn.error', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    await transport.send('hi');

    expect(panel.turn.error).toHaveBeenCalledWith('Failed to fetch');
    expect(panel.setSending).toHaveBeenLastCalledWith(false);
  });

  it('surfaces error-type stream events', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        sseLine({ type: 'text-delta', id: 'm1', delta: 'Starting...' }),
        sseLine({ type: 'error', errorText: 'provider rate limited' }),
        sseLine({ type: 'finish' }),
      ]),
    );

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    await transport.send('hi');

    expect(panel.turn.error).toHaveBeenCalledWith('provider rate limited');
  });

  it('drops concurrent sends silently while a request is in-flight', async () => {
    // Hang the first fetch indefinitely so we can race a second send.
    let firstResolve: (r: Response) => void = () => {};
    fetchSpy.mockImplementationOnce(
      () => new Promise<Response>((r) => { firstResolve = r; }),
    );

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    const first = transport.send('first');
    await transport.send('second'); // dropped immediately, does not await fetch

    // Only one fetch call was made; only one user message was rendered.
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(panel.addUserMessage).toHaveBeenCalledTimes(1);
    expect(panel.addUserMessage).toHaveBeenCalledWith('first');

    // Clean up the hanging first fetch
    firstResolve(sseResponse([sseLine({ type: 'finish' })]));
    await first;
  });

  it('aborts in-flight requests via abort()', async () => {
    // We need to call abort() AFTER fetch has started — otherwise the
    // abort event fires before the mocked fetch attaches its listener
    // and the promise hangs forever. Use a gate that fires when the
    // mock is called, and await that gate before calling abort().
    let capturedSignal: AbortSignal | undefined;
    let fetchStarted!: () => void;
    const fetchStartedPromise = new Promise<void>((resolve) => {
      fetchStarted = resolve;
    });
    fetchSpy.mockImplementationOnce((_input, init) => {
      capturedSignal = (init as RequestInit).signal ?? undefined;
      fetchStarted();
      return new Promise<Response>((_, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    const sending = transport.send('hi');
    await fetchStartedPromise;
    transport.abort();
    await sending;

    expect(capturedSignal?.aborted).toBe(true);
    expect(panel.turn.finish).toHaveBeenCalled();
    expect(panel.turn.error).not.toHaveBeenCalled();
    expect(panel.setSending).toHaveBeenLastCalledWith(false);
  });

  it('calls beforeSend with the payload and posts the transformed result', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse([sseLine({ type: 'finish' })]),
    );

    const beforeSend = vi.fn((payload: Parameters<NonNullable<PipConfig['beforeSend']>>[0]) => {
      return {
        ...payload,
        pageContext: { ...payload.pageContext, title: 'Transformed' },
      };
    });

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({
      config: { ...baseConfig, beforeSend },
      panel,
      overlay,
    });

    await transport.send('hi');

    expect(beforeSend).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.pageContext.title).toBe('Transformed');
  });

  it('in debug mode, logs the payload and does NOT fetch', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({
      config: { ...baseConfig, debug: true },
      panel,
      overlay,
    });

    await transport.send('audit this');

    // Debug mode is an audit tool — it must not ship the payload.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('debug mode'),
      expect.anything(),
    );
    // User still sees the turn complete (with an explanatory message)
    // so the UI doesn't appear frozen.
    expect(panel.turn.appendText).toHaveBeenCalledWith(
      expect.stringContaining('debug mode'),
    );
    expect(panel.turn.finish).toHaveBeenCalledOnce();
    expect(panel.setSending).toHaveBeenLastCalledWith(false);
    log.mockRestore();
  });

  it('propagates capture errors into turn.error', async () => {
    vi.mocked(capturePage).mockRejectedValueOnce(new Error('screenshot failed'));

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    await transport.send('hi');

    expect(panel.turn.error).toHaveBeenCalledWith('screenshot failed');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(panel.setSending).toHaveBeenLastCalledWith(false);
  });

  it('reset() clears conversation history so next send starts fresh', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse([
        sseLine({ type: 'text-delta', id: 'm1', delta: 'one' }),
        sseLine({ type: 'finish' }),
      ]),
    );

    const panel = fakePanel();
    const overlay = fakeOverlay();
    const transport = createTransport({ config: baseConfig, panel, overlay });

    await transport.send('first');
    await transport.send('second');

    // Second send should include the first assistant turn in history
    const secondCallBody = JSON.parse(
      (fetchSpy.mock.calls[1]![1] as RequestInit).body as string,
    );
    expect(secondCallBody.uiMessages.length).toBeGreaterThan(1);

    transport.reset();
    await transport.send('third');
    const thirdCallBody = JSON.parse(
      (fetchSpy.mock.calls[2]![1] as RequestInit).body as string,
    );
    // After reset, only the new user message is in uiMessages
    expect(thirdCallBody.uiMessages).toHaveLength(1);
    expect(thirdCallBody.uiMessages[0].parts[0].text).toBe('third');
  });
});
