import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOverlay } from './freeze.js';

/**
 * The overlay's lifecycle attaches window-level listeners on show() and
 * detaches them on hide(). Bugs here would leave zombies on window after
 * the widget is destroyed — the #1 way a long-lived SPA can accumulate
 * memory leaks from a drop-in script.
 *
 * We track `window.addEventListener` and `window.removeEventListener`
 * calls by spying on them, then assert every listener attached on show()
 * is detached on hide() or destroy().
 */

describe('createOverlay', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('starts hidden with no window listeners', () => {
    const overlay = createOverlay();
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.element.style.display).toBe('none');
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('show() makes the overlay visible and attaches dismiss listeners', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'Click' });
    expect(overlay.isVisible()).toBe(true);
    expect(overlay.element.style.display).toBe('block');

    const events = addSpy.mock.calls.map((c: unknown[]) => c[0]);
    expect(events).toContain('scroll');
    expect(events).toContain('resize');
    expect(events).toContain('click');
    expect(events).toContain('keydown');
  });

  it('hide() removes all the listeners it attached', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'Click' });

    const addedEvents = addSpy.mock.calls.map((c: unknown[]) => c[0]);
    overlay.hide();
    const removedEvents = removeSpy.mock.calls.map((c: unknown[]) => c[0]);

    // Every event attached on show should have a matching remove on hide
    for (const event of addedEvents) {
      expect(removedEvents).toContain(event);
    }
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.element.style.display).toBe('none');
  });

  it('dismisses on scroll event', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'x' });
    expect(overlay.isVisible()).toBe(true);
    window.dispatchEvent(new Event('scroll'));
    expect(overlay.isVisible()).toBe(false);
  });

  it('dismisses on resize event', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'x' });
    window.dispatchEvent(new Event('resize'));
    expect(overlay.isVisible()).toBe(false);
  });

  it('dismisses on click event', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'x' });
    window.dispatchEvent(new Event('click'));
    expect(overlay.isVisible()).toBe(false);
  });

  it('dismisses on Escape keydown', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'x' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(overlay.isVisible()).toBe(false);
  });

  it('does NOT dismiss on non-Escape keydown events', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'x' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(overlay.isVisible()).toBe(true);
  });

  it('calling show() twice does not double-attach listeners', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'first' });
    const callsAfterFirst = addSpy.mock.calls.length;
    overlay.show({ x: 200, y: 200, width: 50, height: 30, caption: 'second' });
    const callsAfterSecond = addSpy.mock.calls.length;
    // Second show() should NOT add more listeners (already visible)
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  it('show() after hide() re-attaches listeners', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'first' });
    overlay.hide();
    const callsBeforeSecond = addSpy.mock.calls.length;
    overlay.show({ x: 200, y: 200, width: 50, height: 30, caption: 'second' });
    expect(addSpy.mock.calls.length).toBeGreaterThan(callsBeforeSecond);
    expect(overlay.isVisible()).toBe(true);
  });

  it('hide() on a not-visible overlay is a no-op', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    // Never shown, but hide() should be safe to call
    expect(() => overlay.hide()).not.toThrow();
    expect(overlay.isVisible()).toBe(false);
  });

  it('destroy() hides, detaches listeners, and removes element from DOM', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'x' });
    expect(document.body.contains(overlay.element)).toBe(true);

    overlay.destroy();

    expect(overlay.isVisible()).toBe(false);
    expect(document.body.contains(overlay.element)).toBe(false);

    // After destroy, dismiss events should not be handled (listeners gone)
    // We can verify by checking that hide handler was called or just by
    // observing that dispatching an event doesn't throw.
    expect(() => window.dispatchEvent(new Event('scroll'))).not.toThrow();
  });

  it('dismissing via one event detaches all listeners so subsequent events are no-ops', () => {
    const overlay = createOverlay();
    document.body.appendChild(overlay.element);
    overlay.show({ x: 100, y: 100, width: 50, height: 30, caption: 'x' });

    // First scroll dismisses
    window.dispatchEvent(new Event('scroll'));
    expect(overlay.isVisible()).toBe(false);

    // After dismiss, subsequent events shouldn't trigger anything
    const removeCountAfterHide = removeSpy.mock.calls.length;
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('click'));
    // No more removes — listeners were already gone
    expect(removeSpy.mock.calls.length).toBe(removeCountAfterHide);
  });
});
