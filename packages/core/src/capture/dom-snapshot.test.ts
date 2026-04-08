import { describe, it, expect, beforeEach } from 'vitest';
import { buildDomSnapshot } from './dom-snapshot.js';

/**
 * The DOM snapshot is the semantic channel that goes into the LLM prompt
 * next to the screenshot. Bugs here produce garbage that the model then
 * hallucinates over. Every selector rule, label extractor, and redaction
 * path deserves a test.
 *
 * jsdom's default viewport is 1024x768. We stub getBoundingClientRect on
 * elements we want to position so tests don't depend on jsdom layout
 * quirks (jsdom reports 0x0 for most elements by default).
 */

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function stubRect(
  el: HTMLElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  el.getBoundingClientRect = () => ({
    x, y,
    left: x, top: y,
    right: x + w, bottom: y + h,
    width: w, height: h,
    toJSON: () => ({}),
  });
}

function buildEmpty(): string {
  return buildDomSnapshot({ redactedElements: new Set(), redactedRects: [] });
}

describe('buildDomSnapshot', () => {
  beforeEach(() => setBody(''));

  it('returns a placeholder when nothing interactive is in the viewport', () => {
    setBody('<div>plain text</div>');
    expect(buildEmpty()).toContain('no interactive elements');
  });

  it('renders a button with its text label at its bounding rect', () => {
    setBody('<button id="b">Create project</button>');
    const button = document.getElementById('b')!;
    stubRect(button, 340, 120, 96, 32);
    const snapshot = buildEmpty();
    expect(snapshot).toContain('[button] "Create project" @ (340, 120, 96, 32)');
  });

  it('prefers aria-label over text content', () => {
    setBody('<button id="b" aria-label="Close dialog">×</button>');
    stubRect(document.getElementById('b')!, 10, 10, 20, 20);
    expect(buildEmpty()).toContain('"Close dialog"');
  });

  it('describes inputs with their type and (empty ...) placeholder when no value', () => {
    setBody('<input id="e" type="email" />');
    stubRect(document.getElementById('e')!, 0, 0, 200, 30);
    const snap = buildEmpty();
    expect(snap).toContain('[input:email]');
    expect(snap).toContain('(empty email input)');
  });

  it('shows the input value when present', () => {
    setBody('<input id="e" type="email" value="user@example.com" />');
    stubRect(document.getElementById('e')!, 0, 0, 200, 30);
    expect(buildEmpty()).toContain('"user@example.com"');
  });

  it('shows the placeholder (not value) when value is empty and placeholder is set', () => {
    setBody('<input id="e" type="text" placeholder="Search..." />');
    stubRect(document.getElementById('e')!, 0, 0, 200, 30);
    const snap = buildEmpty();
    expect(snap).toContain('(placeholder: Search...)');
  });

  it('never shows the value of a password input even if populated', () => {
    setBody('<input id="p" type="password" value="hunter2" />');
    stubRect(document.getElementById('p')!, 0, 0, 200, 30);
    const snap = buildEmpty();
    expect(snap).not.toContain('hunter2');
    // Falls through to (empty password input) since the function strips
    // the value for password inputs regardless of whether one was set.
    expect(snap).toContain('(empty password input)');
  });

  it('picks up headings', () => {
    setBody('<h2 id="h">Your projects</h2>');
    stubRect(document.getElementById('h')!, 40, 100, 200, 28);
    expect(buildEmpty()).toContain('[h2] "Your projects"');
  });

  it('picks up elements with ARIA roles', () => {
    setBody('<div id="d" role="button">Pretend button</div>');
    stubRect(document.getElementById('d')!, 0, 0, 100, 30);
    const snap = buildEmpty();
    expect(snap).toContain('[div[role=button]]');
    expect(snap).toContain('"Pretend button"');
  });

  it('picks up elements with aria-label even if not otherwise interactive', () => {
    setBody('<div id="d" aria-label="status indicator"></div>');
    stubRect(document.getElementById('d')!, 0, 0, 50, 50);
    expect(buildEmpty()).toContain('"status indicator"');
  });

  it('picks up elements with data-testid', () => {
    setBody('<div id="d" data-testid="sidebar">sidebar nav</div>');
    stubRect(document.getElementById('d')!, 0, 0, 200, 400);
    expect(buildEmpty()).toContain('"sidebar nav"');
  });

  it('skips elements with zero width or height', () => {
    setBody('<button id="b">Hidden</button>');
    stubRect(document.getElementById('b')!, 0, 0, 0, 0);
    expect(buildEmpty()).toContain('no interactive elements');
  });

  it('skips elements fully outside the viewport', () => {
    setBody('<button id="b">Offscreen</button>');
    // jsdom default viewport is 1024x768 — position far past the right edge
    stubRect(document.getElementById('b')!, 5000, 5000, 100, 30);
    expect(buildEmpty()).toContain('no interactive elements');
  });

  it('replaces the label with [redacted] for elements in the redacted set', () => {
    setBody(`
      <button id="go">Visible label</button>
      <button id="secret">Secret label</button>
    `);
    const go = document.getElementById('go')!;
    const secret = document.getElementById('secret')!;
    stubRect(go, 0, 0, 100, 30);
    stubRect(secret, 0, 40, 100, 30);
    const snap = buildDomSnapshot({
      redactedElements: new Set([secret]),
      redactedRects: [],
    });
    expect(snap).toContain('"Visible label"');
    expect(snap).toContain('"[redacted]"');
    expect(snap).not.toContain('Secret label');
  });

  it('collapses internal whitespace in labels', () => {
    setBody('<button id="b">  Hello\n\t\tworld  </button>');
    stubRect(document.getElementById('b')!, 0, 0, 100, 30);
    expect(buildEmpty()).toContain('"Hello world"');
  });

  it('strips script and style content from label text', () => {
    setBody('<button id="b">Click <script>alert(1)</script>me</button>');
    stubRect(document.getElementById('b')!, 0, 0, 100, 30);
    const snap = buildEmpty();
    expect(snap).toContain('"Click me"');
    expect(snap).not.toContain('alert');
  });

  it('truncates very long labels with an ellipsis', () => {
    const long = 'x'.repeat(500);
    setBody(`<button id="b">${long}</button>`);
    stubRect(document.getElementById('b')!, 0, 0, 100, 30);
    const snap = buildEmpty();
    // Should be truncated to max 120 chars + ellipsis marker
    const labelMatch = snap.match(/"(.*?)"/);
    expect(labelMatch).toBeTruthy();
    expect(labelMatch![1]!.length).toBeLessThanOrEqual(120);
    expect(labelMatch![1]!.endsWith('…')).toBe(true);
  });

  it('caps output at 120 elements to protect the prompt budget', () => {
    const html = Array.from(
      { length: 200 },
      (_, i) => `<button id="b${i}">Button ${i}</button>`,
    ).join('');
    setBody(html);
    for (let i = 0; i < 200; i++) {
      stubRect(document.getElementById(`b${i}`)!, i % 10, i, 80, 20);
    }
    const snap = buildEmpty();
    const lineCount = snap.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(120);
  });

  it('skips elements with no discoverable label text', () => {
    // No text, no aria-label, no title
    setBody('<button id="b"></button>');
    stubRect(document.getElementById('b')!, 0, 0, 30, 30);
    expect(buildEmpty()).toContain('no interactive elements');
  });

  it('falls back to the title attribute when there is no text', () => {
    setBody('<button id="b" title="Help"></button>');
    stubRect(document.getElementById('b')!, 0, 0, 30, 30);
    expect(buildEmpty()).toContain('"Help"');
  });
});
