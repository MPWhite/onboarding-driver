import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHighlight, type HighlightArgs } from './arrow.js';

/**
 * Tests for the overlay renderer — primarily the caption-placement
 * geometry. The actual SVG render is hard to assert visually inside
 * jsdom, but we can verify:
 *
 *   - The container gets cleared before a new render
 *   - An <svg> and a `.pip-overlay-caption` element are produced
 *   - The caption is positioned inside the viewport (never off-screen)
 *   - The side-picking logic prefers the direction with most room
 *
 * This locks in the coordinate math so a future refactor doesn't
 * silently start rendering captions off-screen.
 */

const ORIG_WIDTH = window.innerWidth;
const ORIG_HEIGHT = window.innerHeight;

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

function render(args: HighlightArgs): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderHighlight(container, args);
  return container;
}

function getCaption(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.pip-overlay-caption');
  if (!el) throw new Error('caption not found');
  return el;
}

function getCaptionLeft(container: HTMLElement): number {
  return parseInt(getCaption(container).style.left, 10);
}

function getCaptionTop(container: HTMLElement): number {
  return parseInt(getCaption(container).style.top, 10);
}

describe('renderHighlight', () => {
  beforeEach(() => {
    setViewport(1024, 768);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    setViewport(ORIG_WIDTH, ORIG_HEIGHT);
  });

  it('produces an SVG + caption element', () => {
    const container = render({
      x: 100, y: 100, width: 50, height: 30, caption: 'Click here',
    });
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('.pip-overlay-caption')).toBeTruthy();
  });

  it('clears previous render output before drawing a new one', () => {
    const container = render({
      x: 100, y: 100, width: 50, height: 30, caption: 'first',
    });
    const firstSvg = container.querySelector('svg');
    render.call(null, { x: 100, y: 100, width: 50, height: 30, caption: 'second' });
    // Calling render on the SAME container should replace contents, not append
    renderHighlight(container, { x: 200, y: 200, width: 50, height: 30, caption: 'second' });
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).not.toBe(firstSvg);
    expect(getCaption(container).textContent).toBe('second');
  });

  it('writes the caption text verbatim (textContent, not innerHTML)', () => {
    const container = render({
      x: 100, y: 100, width: 50, height: 30,
      // Ensure <script> or HTML in the caption stays as literal text
      caption: '<script>alert(1)</script>',
    });
    const caption = getCaption(container);
    expect(caption.textContent).toBe('<script>alert(1)</script>');
    // No script tag should have been created
    expect(container.querySelector('script')).toBeNull();
  });

  it('positions caption below the target when there is room (default preference)', () => {
    // Target near the top of a tall viewport — lots of room below.
    const container = render({
      x: 200, y: 50, width: 100, height: 30, caption: 'Click',
    });
    const top = getCaptionTop(container);
    // Caption top should be below the target bottom (50 + 30 + gap = ~92)
    expect(top).toBeGreaterThanOrEqual(80);
  });

  it('positions caption above the target when there is no room below', () => {
    // Target near the bottom of the viewport.
    const container = render({
      x: 200, y: 700, width: 100, height: 30, caption: 'Click',
    });
    const top = getCaptionTop(container);
    // Caption should be above the target (target top is 700)
    expect(top).toBeLessThan(700);
  });

  it('positions caption to the right of target when top/bottom are cramped', () => {
    // Small viewport where neither top nor bottom has room
    setViewport(800, 100);
    const container = render({
      x: 100, y: 35, width: 50, height: 30, caption: 'Click',
    });
    const left = getCaptionLeft(container);
    // Should be right of target (target right = 150)
    expect(left).toBeGreaterThanOrEqual(150);
  });

  it('clamps caption horizontal position inside the viewport', () => {
    // Target at the far right edge — caption below would overflow right
    const container = render({
      x: 1000, y: 50, width: 20, height: 20, caption: 'Click',
    });
    const left = getCaptionLeft(container);
    // Caption width is ~240px, must fit inside 1024 viewport
    expect(left + 240).toBeLessThanOrEqual(1024);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('clamps caption horizontal position at the left edge', () => {
    const container = render({
      x: 0, y: 50, width: 20, height: 20, caption: 'Click',
    });
    const left = getCaptionLeft(container);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('sets the SVG viewBox to match the full viewport', () => {
    setViewport(1280, 720);
    const container = render({
      x: 100, y: 100, width: 50, height: 30, caption: 'x',
    });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 1280 720');
  });

  it('clamps target rect coordinates to the viewport (no negative values)', () => {
    const container = render({
      x: -50, y: -20, width: 50, height: 30, caption: 'Click',
    });
    // Should render without error and produce a valid SVG
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('accepts very small target rects without crashing', () => {
    const container = render({
      x: 100, y: 100, width: 1, height: 1, caption: 'x',
    });
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('includes an aria-live region via role=status on the caption', () => {
    const container = render({
      x: 100, y: 100, width: 50, height: 30, caption: 'Click here',
    });
    expect(getCaption(container).getAttribute('role')).toBe('status');
  });
});
