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

  const { host, root } = createShadowContainer(mountTarget);

  let isPaused = readConsent() === 'denied';

  // Build the UI children in order. Order matters for stacking: button
  // and panel are peers; consent dialog sits above both as an overlay.
  const panel: ChatPanelHandle = createChatPanel({
    onSend: (text) => {
      panel.addUserMessage(text);
      panel.setSending(true);
      // Transport arrives in task 7; for now, provide a visible placeholder
      // so the UI feels alive during the scaffold phase.
      const turn = panel.startAssistantTurn();
      requestAnimationFrame(() => {
        turn.appendText(
          "(transport not wired yet — this is a placeholder. I'll have real answers once the streaming layer lands.)",
        );
        turn.finish();
        panel.setSending(false);
      });
      if (config.debug) {
        console.log('[pip] user sent:', text);
      }
    },
    onClose: () => {
      panel.hide();
    },
    onTogglePause: (paused) => {
      isPaused = paused;
    },
  });

  // Start in paused state if the user has previously declined consent.
  if (isPaused) panel.setPaused(true);

  const button = createMouseButton({
    onClick: () => {
      if (panel.isVisible()) {
        panel.hide();
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
      // again by clicking the mouse button.
    },
  });

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
