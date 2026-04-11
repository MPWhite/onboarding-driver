/**
 * Public API for `@pip-help/core`.
 *
 * This module has NO side effects — importing it does not mount the widget.
 * Call `mount(config)` explicitly to render, or import `@pip-help/core/auto`
 * if you want auto-mount behavior.
 */
import { resolveConfig } from './config.js';
import { createShadowContainer } from './shadow-root.js';
import { createMouse, type MouseHandle } from './widget/mouse.js';
import {
  createConsentDialog,
  readConsent,
  writeConsent,
  type ConsentDialogHandle,
} from './widget/consent-dialog.js';
import { createOverlay, type OverlayHandle } from './overlay/index.js';
import { createTransport, type TransportController } from './transport/index.js';
import type { PipConfig, PipInstance } from './types.js';

export type {
  PipConfig,
  PipInstance,
  PipOutgoingPayload,
  PipUIMessageLike,
  PipMessagePart,
} from './types.js';
export { PipConfigError } from './config.js';

/** Library version — bumped as part of releases. */
export const VERSION = '0.0.0';

/**
 * Mount pip into the current document. Returns a `PipInstance` that can be
 * controlled programmatically or destroyed later.
 *
 * Calling `mount()` twice is a no-op on the second call and returns the
 * existing instance — keeps consumers who call it inside React effects or
 * other re-entrant code from stacking widgets.
 */
export function mount(input: Partial<PipConfig>): PipInstance {
  if (typeof document === 'undefined') {
    throw new Error('pip: mount() must be called in a browser environment');
  }
  if (activeInstance) {
    return activeInstance;
  }

  const config = resolveConfig(input);
  const mountTarget = config.mountTarget ?? document.body;

  // If we're running in `<head>` before <body> exists and no explicit
  // mountTarget was passed, fail loudly with a useful error instead of
  // letting `appendChild` throw an opaque "Cannot read properties of
  // null" a few stack frames later. The auto-mount path already defers
  // until DOMContentLoaded so this only fires on misuse of the manual
  // API.
  if (!mountTarget) {
    throw new Error(
      'pip: mount() was called before <body> existed. ' +
        'Defer your call until DOMContentLoaded, use `@pip-help/core/auto`, ' +
        'or pass an explicit `mountTarget` to mount().',
    );
  }

  const { host, root } = createShadowContainer(mountTarget);

  let isPaused = readConsent() === 'denied';

  const overlay: OverlayHandle = createOverlay();

  // Forward declare so onSend can reference the transport before it exists.
  let transport: TransportController | null = null;

  const mouse: MouseHandle = createMouse({
    onSend: (text) => {
      if (isPaused) return;
      // First-send gate: if the user has never answered the consent prompt,
      // pop it now rather than silently shipping their page state.
      if (readConsent() === null) {
        consent.show();
        return;
      }
      // Fire-and-forget — transport owns its own error handling and
      // reflects state through the mouse handle.
      void transport?.send(text);
    },
    onTogglePause: (paused) => {
      isPaused = paused;
    },
  });

  transport = createTransport({ config, mouse, overlay });

  // Start in paused state if the user has previously declined consent.
  if (isPaused) mouse.setPaused(true);

  const consent: ConsentDialogHandle = createConsentDialog({
    onAccept: () => {
      mouse.focusInput();
    },
    onDecline: () => {
      isPaused = true;
      mouse.setPaused(true);
    },
    onClose: () => {
      // User dismissed without deciding. Leave the mouse visible but
      // don't fire anything — they can try again by focusing the input.
      mouse.focusInput();
    },
  });

  // Stacking: overlay underneath (dim backdrop + ring), mouse on top,
  // consent on top of everything so it can gate first use.
  root.appendChild(overlay.element);
  root.appendChild(mouse.element);
  root.appendChild(consent.element);

  const instance: PipInstance = {
    open: () => {
      if (readConsent() === null) {
        consent.show();
      } else {
        mouse.focusInput();
      }
    },
    close: () => {
      // "Close" maps to dismissing any active overlay/bubble — the mouse
      // itself never hides in the new UX.
      overlay.hide();
    },
    setPaused: (paused) => {
      isPaused = paused;
      mouse.setPaused(paused);
      if (paused) {
        // Reflect kill-switch intent in consent so reloads remember it.
        writeConsent('denied');
      }
    },
    isPaused: () => isPaused,
    destroy: () => {
      transport?.abort();
      transport?.reset();
      overlay.destroy();
      mouse.destroy();
      host.remove();
      if (activeInstance === instance) {
        activeInstance = null;
      }
    },
    config,
  };

  activeInstance = instance;
  return instance;
}

let activeInstance: PipInstance | null = null;

export function getActiveInstance(): PipInstance | null {
  return activeInstance;
}
