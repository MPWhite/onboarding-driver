/**
 * Auto-mount entry.
 *
 * This is the side-effect version of `@pip-help/core`. Importing it (either
 * via `import '@pip-help/core/auto'` or the IIFE `<script>` bundle) reads
 * the widget's config from the surrounding environment and calls `mount()`
 * as soon as the DOM is ready.
 *
 * Script-tag path:
 *   <script src=".../iife.js" data-pip-endpoint="/api/pip"></script>
 *   → config is read from `data-pip-*` attributes on the script tag itself.
 *
 * NPM side-effect path:
 *   import '@pip-help/core/auto';
 *   → config is read from a `<meta name="pip-endpoint" content="/api/pip">`
 *     tag, or from `window.__PIP_CONFIG__`. Both are checked; window wins
 *     if both exist.
 *
 * Any mount errors are logged and swallowed — auto-mount must never break
 * the host page.
 */
import { configFromScriptTag, findPipScriptTag } from './config.js';
import { mount } from './index.js';
import type { PipConfig } from './types.js';

// Re-export the manual API so the IIFE's `pip` global still exposes
// `pip.mount(...)`, `pip.VERSION`, etc.
export * from './index.js';

declare global {
  interface Window {
    __PIP_CONFIG__?: Partial<PipConfig>;
  }
}

function readAutoMountConfig(): Partial<PipConfig> | null {
  if (typeof window !== 'undefined' && window.__PIP_CONFIG__) {
    return window.__PIP_CONFIG__;
  }

  const scriptConfig = configFromScriptTag(findPipScriptTag());
  if (scriptConfig) return scriptConfig;

  if (typeof document !== 'undefined') {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="pip-endpoint"]');
    const endpoint = meta?.content;
    if (endpoint) return { endpoint };
  }

  return null;
}

function tryAutoMount(): void {
  try {
    const config = readAutoMountConfig();
    if (!config) {
      console.warn(
        '[pip] auto-mount skipped: no config found. ' +
          'Add data-pip-endpoint="..." to the <script> tag, ' +
          'a <meta name="pip-endpoint"> tag, or set window.__PIP_CONFIG__.',
      );
      return;
    }
    mount(config);
  } catch (error) {
    console.error('[pip] auto-mount failed:', error);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryAutoMount, { once: true });
  } else {
    tryAutoMount();
  }
}
