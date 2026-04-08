/**
 * Public API for `@pip-help/core`.
 *
 * This module has NO side effects — importing it does not mount the widget.
 * Call `mount(config)` explicitly to render, or import `@pip-help/core/auto`
 * if you want auto-mount behavior.
 */
import { resolveConfig } from './config.js';
import { createShadowContainer } from './shadow-root.js';
import { createMouseButton } from './widget/mouse-button.js';
import { createChatPanel, type ChatPanelHandle } from './widget/chat-panel.js';
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

  // Forward declare so onSend can reference the transport before it exists,
  // and so onClose can focus the button after hiding the panel (for a11y —
  // keyboard users need focus to land somewhere meaningful when the dialog
  // dismisses, not be left orphaned on a hidden textarea).
  let transport: TransportController | null = null;
  let button: HTMLButtonElement | null = null;

  // Build the UI children in order. Order matters for stacking: button
  // and panel are peers; consent dialog sits above both as an overlay.
  const panel: ChatPanelHandle = createChatPanel({
    onSend: (text) => {
      if (isPaused) return;
      // Fire-and-forget — transport owns its own error handling and
      // reflects state through the panel handle.
      void transport?.send(text);
    },
    onClose: () => {
      panel.hide();
      // Return focus to the trigger. Skipped only if button hasn't been
      // constructed yet (unreachable — onClose only fires on user input).
      button?.focus();
    },
    onTogglePause: (paused) => {
      isPaused = paused;
    },
  });

  transport = createTransport({ config, panel, overlay });

  // Start in paused state if the user has previously declined consent.
  if (isPaused) panel.setPaused(true);

  button = createMouseButton({
    onClick: () => {
      if (panel.isVisible()) {
        panel.hide();
        button?.focus();
        return;
      }
      if (readConsent() === null) {
        consent.show();
        return;
      }
      panel.show();
    },
  });

  const consent: ConsentDialogHandle = createConsentDialog({
    onAccept: () => {
      panel.show();
    },
    onDecline: () => {
      isPaused = true;
      panel.setPaused(true);
      panel.show();
    },
    onClose: () => {
      // User dismissed without deciding. Don't open the panel; they can try
      // again by clicking the mouse button. Return focus there so keyboard
      // users don't lose their place.
      button?.focus();
    },
  });

  root.appendChild(overlay.element);
  root.appendChild(button);
  root.appendChild(panel.element);
  root.appendChild(consent.element);

  const instance: PipInstance = {
    open: () => {
      if (readConsent() === null) {
        consent.show();
      } else {
        panel.show();
      }
    },
    close: () => {
      panel.hide();
    },
    setPaused: (paused) => {
      isPaused = paused;
      panel.setPaused(paused);
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
