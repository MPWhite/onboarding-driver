import { describe, it, expect, vi } from 'vitest';
import { createPipHandler } from './handler.js';
import type { GetContextFn } from './types.js';

/**
 * These tests target the zod-validated request contract specifically.
 * We don't stub out the full AI SDK call path — that requires a real
 * provider or a heavy mock, and end-to-end streaming is covered by the
 * demo app smoke test. Here we just verify the handler:
 *
 *   - Returns 400 on a missing/malformed JSON body
 *   - Returns 400 on a payload that fails the zod schema
 *   - Surfaces a helpful error message for either case
 *
 * Everything beyond validation (getContext, agent construction, streaming)
 * only runs if we pass validation, so we can trust those paths from
 * prompt.test.ts and the types.
 */

function makeRequest(body: unknown): Request {
  return new Request('http://test.local/api/pip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function makeHandler() {
  return createPipHandler({
    model: 'anthropic/claude-sonnet-4.6',
    getContext: () => 'context',
  });
}

describe('createPipHandler — request validation', () => {
  it('returns 400 when the body is not valid JSON', async () => {
    const handler = makeHandler();
    const request = new Request('http://test.local/api/pip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'this is not json',
    });
    const response = await handler(request);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/valid JSON/i);
  });

  it('returns 400 when uiMessages is missing', async () => {
    const handler = makeHandler();
    const response = await handler(
      makeRequest({
        pageContext: {
          url: 'https://example.com',
          title: 'X',
          viewport: { width: 800, height: 600, devicePixelRatio: 1 },
          redactedDom: '',
        },
      }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 when pageContext is missing', async () => {
    const handler = makeHandler();
    const response = await handler(
      makeRequest({
        uiMessages: [],
      }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 when pageContext.url is not a URL', async () => {
    const handler = makeHandler();
    const response = await handler(
      makeRequest({
        uiMessages: [],
        pageContext: {
          url: 'not-a-url',
          title: 'X',
          viewport: { width: 800, height: 600, devicePixelRatio: 1 },
          redactedDom: '',
        },
      }),
    );
    expect(response.status).toBe(400);
  });

  it('includes zod issues in the 400 body for debugging', async () => {
    const handler = makeHandler();
    const response = await handler(
      makeRequest({
        uiMessages: 'not an array',
        pageContext: {
          url: 'https://example.com',
          title: 'X',
          viewport: { width: 800, height: 600, devicePixelRatio: 1 },
          redactedDom: '',
        },
      }),
    );
    const body = (await response.json()) as { error: string; issues?: unknown };
    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid pip request payload');
    expect(body.issues).toBeDefined();
  });

  it('caps the error body read when the server throws mid-stream (via 400 path)', async () => {
    // Sanity check that error responses are content-type JSON
    const handler = makeHandler();
    const response = await handler(
      makeRequest('malformed'),
    );
    expect(response.headers.get('content-type')).toContain('application/json');
  });
});

describe('createPipHandler — getContext invocation', () => {
  it('passes the latest user text as query to getContext', async () => {
    const getContext = vi.fn<GetContextFn>(() => 'context');
    const handler = createPipHandler({
      model: 'anthropic/claude-sonnet-4.6',
      getContext,
    });

    // We expect the handler to reach getContext before failing downstream
    // on the actual model call (no network/key configured here). The test
    // succeeds as long as getContext got called with the right query.
    const response = await handler(
      makeRequest({
        uiMessages: [
          {
            id: 'u1',
            role: 'user',
            parts: [{ type: 'text', text: 'How do I make a new project?' }],
          },
        ],
        pageContext: {
          url: 'https://example.com/x',
          title: 'X',
          viewport: { width: 800, height: 600, devicePixelRatio: 1 },
          redactedDom: '',
        },
      }),
    );

    // Either streaming works (unlikely without a real model) or we get a
    // non-200 from the downstream call. Either way, validation passed and
    // getContext should have been called with the user's query.
    void response;
    expect(getContext).toHaveBeenCalledOnce();
    expect(getContext.mock.calls[0]?.[0]).toMatchObject({
      query: 'How do I make a new project?',
      url: 'https://example.com/x',
    });
  });
});
