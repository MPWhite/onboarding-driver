import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  findRedactionTargets,
  measureRedactionRects,
  applyRectsToScreenshot,
} from './redact.js';

/**
 * Redaction is the most security-critical surface in the widget — these
 * tests are the line between "we claim to protect password fields" and
 * "we actually do". Every always-on selector deserves a test, and so
 * does the dev-configurable path.
 */

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe('findRedactionTargets', () => {
  beforeEach(() => {
    setBody('');
  });

  it('always redacts input[type="password"] with no config', () => {
    setBody(`
      <input type="text" id="email" />
      <input type="password" id="pwd" />
    `);
    const targets = findRedactionTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0]?.id).toBe('pwd');
  });

  it('always redacts credit-card autocomplete inputs', () => {
    setBody(`
      <input type="text" autocomplete="cc-number" id="cc" />
      <input type="text" autocomplete="cc-csc" id="cvv" />
      <input type="text" autocomplete="email" id="email" />
    `);
    const ids = findRedactionTargets().map((el) => el.id);
    expect(ids).toContain('cc');
    expect(ids).toContain('cvv');
    expect(ids).not.toContain('email');
  });

  it('always redacts [data-pip="redact"]', () => {
    setBody(`
      <div id="a" data-pip="redact">secret</div>
      <div id="b">public</div>
    `);
    const ids = findRedactionTargets().map((el) => el.id);
    expect(ids).toEqual(['a']);
  });

  it('adds dev-supplied selectors on top of always-on ones', () => {
    setBody(`
      <input type="password" id="pwd" />
      <div class="customer-email" id="email-div">user@example.com</div>
      <div id="other">not sensitive</div>
    `);
    const ids = findRedactionTargets(['.customer-email']).map((el) => el.id);
    expect(ids).toContain('pwd');
    expect(ids).toContain('email-div');
    expect(ids).not.toContain('other');
  });

  it('de-duplicates elements that match multiple selectors', () => {
    setBody(`
      <input type="password" id="pwd" data-pip="redact" class="secret" />
    `);
    const targets = findRedactionTargets(['.secret']);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.id).toBe('pwd');
  });

  it('ignores invalid CSS selectors from dev config without crashing', () => {
    setBody(`<input type="password" id="pwd" />`);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // `>>>bogus` is not a valid selector
    const targets = findRedactionTargets(['>>>bogus', '.real']);
    // Should still pick up the always-on password field
    expect(targets.map((el) => el.id)).toContain('pwd');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('invalid redact selector'),
    );
    warn.mockRestore();
  });

  it('empty dev-supplied list does not change always-on behavior', () => {
    setBody(`<input type="password" id="pwd" />`);
    const a = findRedactionTargets();
    const b = findRedactionTargets([]);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });
});

describe('measureRedactionRects', () => {
  beforeEach(() => setBody(''));

  it('skips elements with zero width or height', () => {
    // jsdom returns 0x0 for everything unless we stub getBoundingClientRect;
    // stub explicitly so we're testing the skip logic, not jsdom quirks.
    const a = document.createElement('div');
    const b = document.createElement('div');
    a.getBoundingClientRect = () => ({
      x: 10, y: 10, left: 10, top: 10, right: 110, bottom: 60, width: 100, height: 50, toJSON: () => ({}),
    });
    b.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}),
    });
    const rects = measureRedactionRects([a, b]);
    expect(rects).toEqual([
      { x: 10, y: 10, width: 100, height: 50 },
    ]);
  });

  it('clamps negative coordinates to 0 and ceilings fractional sizes', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({
      x: -5, y: -2, left: -5, top: -2,
      right: 95, bottom: 47, width: 100.3, height: 49.7, toJSON: () => ({}),
    });
    const rects = measureRedactionRects([el]);
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 101, height: 50 });
  });

  it('skips elements fully outside the viewport', () => {
    // Default jsdom viewport is 1024x768
    const offscreen = document.createElement('div');
    offscreen.getBoundingClientRect = () => ({
      x: 5000, y: 5000, left: 5000, top: 5000,
      right: 5100, bottom: 5100, width: 100, height: 100, toJSON: () => ({}),
    });
    expect(measureRedactionRects([offscreen])).toEqual([]);
  });
});

describe('applyRectsToScreenshot', () => {
  it('returns the original data URL when there are no rects', async () => {
    const tiny =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8//8/AwAI/AL+TQoc2QAAAABJRU5ErkJggg==';
    const result = await applyRectsToScreenshot(tiny, [], 1);
    expect(result).toBe(tiny);
  });

  // Canvas rasterization inside jsdom is unreliable — html-to-image path
  // tests live in an e2e browser test, not here. The "no rects" short
  // circuit above is what matters for unit-level correctness.
});
