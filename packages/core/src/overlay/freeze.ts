/**
 * Overlay lifecycle and dismiss handling.
 *
 * The overlay host is a position:fixed full-viewport div inside the pip
 * Shadow DOM. When the LLM emits a `highlight` tool call, the transport
 * layer calls `show()` with the coordinates; `arrow.ts` paints the SVG and
 * caption into the host.
 *
 * Dismiss triggers (any of these clears the overlay):
 *   - User clicks anywhere
 *   - Escape key
 *   - Window scroll
 *   - Window resize
 *   - An explicit `hide()` call from the transport layer (e.g., when a new
 *     chat turn begins or the panel closes)
 *
 * Scroll/resize dismiss is important: our coordinate-based pointing is only
 * valid as long as the layout doesn't change. The moment anything moves, we
 * pull the overlay rather than point at the wrong thing.
 */

import {
  renderHighlight,
  type HighlightArgs,
  type RenderHighlightOptions,
} from './arrow.js';

export interface OverlayHandle {
  element: HTMLElement;
  show(args: HighlightArgs, options?: RenderHighlightOptions): void;
  hide(): void;
  isVisible(): boolean;
  destroy(): void;
}

export function createOverlay(): OverlayHandle {
  const host = document.createElement('div');
  host.className = 'pip-overlay';
  host.style.display = 'none';

  let visible = false;

  function show(args: HighlightArgs, options?: RenderHighlightOptions): void {
    renderHighlight(host, args, options);
    host.style.display = 'block';
    if (!visible) {
      visible = true;
      attachDismissListeners();
    }
  }

  function hide(): void {
    if (!visible) return;
    visible = false;
    host.style.display = 'none';
    host.innerHTML = '';
    detachDismissListeners();
  }

  function onDismissEvent(event: Event): void {
    // Ignore the event that got us here (e.g., the click that opened the
    // overlay won't dismiss it because listeners are attached after show()).
    if (!visible) return;
    // We don't try to distinguish the target — any scroll/resize/click/esc
    // means the layout may have moved or the user is done looking.
    void event;
    hide();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') hide();
  }

  function attachDismissListeners(): void {
    // `capture: true` so we see events before the page handles them. That
    // way a click on a host-page button still dismisses the overlay (and
    // still lets the click proceed to the button — we don't preventDefault).
    window.addEventListener('scroll', onDismissEvent, { passive: true, capture: true });
    window.addEventListener('resize', onDismissEvent, { passive: true });
    window.addEventListener('click', onDismissEvent, { capture: true });
    window.addEventListener('keydown', onKeyDown);
  }

  function detachDismissListeners(): void {
    window.removeEventListener('scroll', onDismissEvent, { capture: true } as EventListenerOptions);
    window.removeEventListener('resize', onDismissEvent);
    window.removeEventListener('click', onDismissEvent, { capture: true } as EventListenerOptions);
    window.removeEventListener('keydown', onKeyDown);
  }

  return {
    element: host,
    show,
    hide,
    isVisible: () => visible,
    destroy: () => {
      hide();
      host.remove();
    },
  };
}
