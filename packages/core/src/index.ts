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
import type { PipConfig, PipInstance } from './types.js';

export type { PipConfig, PipInstance, PipOutgoingPayload, PipUIMessageLike, PipMessagePart } from './types.js';
export { PipConfigError } from './config.js';

/** Library version — injected at build time from package.json. */
export const VERSION = '0.0.0';

/**
 * Mount pip into the current document. Returns a `PipInstance` that can be
 * controlled programmatically or destroyed later.
 *
 * Calling `mount()` twice is a no-op on the second call and returns the
 * existing instance. This keeps consumers who blindly call it inside React
 * effects or other re-entrant code from stacking widgets.
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

  let isPaused = false;
  let isOpen = false;

  const button = createMouseButton({
    onClick: () => {
      if (isPaused) return;
      isOpen = !isOpen;
      // Chat panel toggling lands in the next task; for now, log so we can
      // smoke-test wiring end-to-end.
      if (config.debug) {
        console.log('[pip] button clicked, isOpen=', isOpen);
      }
    },
  });
  root.appendChild(button);

  const instance: PipInstance = {
    open: () => {
      isOpen = true;
    },
    close: () => {
      isOpen = false;
    },
    setPaused: (paused: boolean) => {
      isPaused = paused;
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

/** The single active pip instance, if any. Exported for tests and auto-mount. */
let activeInstance: PipInstance | null = null;

export function getActiveInstance(): PipInstance | null {
  return activeInstance;
}
