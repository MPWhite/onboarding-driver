import type { PipConfig } from './types.js';

/**
 * Normalize user-supplied config. Fills in defaults and validates that the
 * required fields are present. Throws if the config is unusable — pip
 * should fail loudly rather than silently render a broken widget.
 */
export function resolveConfig(input: Partial<PipConfig>): PipConfig {
  if (!input.endpoint || typeof input.endpoint !== 'string') {
    throw new PipConfigError(
      'pip: `endpoint` is required. Pass it to mount({ endpoint }) or set ' +
        '`data-pip-endpoint` on the <script> tag.',
    );
  }

  return {
    endpoint: input.endpoint,
    redact: Array.isArray(input.redact) ? [...input.redact] : [],
    debug: Boolean(input.debug),
    ...(input.beforeSend ? { beforeSend: input.beforeSend } : {}),
    ...(input.mountTarget ? { mountTarget: input.mountTarget } : {}),
  };
}

/**
 * Parse config from the `data-pip-*` attributes on the <script> tag that
 * loaded this bundle. Used by the auto-mount path.
 *
 * Recognized attributes:
 *   data-pip-endpoint   (required)  — URL of the backend route
 *   data-pip-redact     (optional)  — comma-separated CSS selectors
 *   data-pip-debug      (optional)  — any truthy value enables debug
 */
export function configFromScriptTag(
  script: HTMLScriptElement | null,
): Partial<PipConfig> | null {
  if (!script) return null;
  const endpoint = script.dataset['pipEndpoint'];
  if (!endpoint) return null;

  const redactAttr = script.dataset['pipRedact'];
  const redact = redactAttr
    ? redactAttr.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  return {
    endpoint,
    ...(redact ? { redact } : {}),
    debug: script.dataset['pipDebug'] !== undefined,
  };
}

/**
 * Find the <script> tag that loaded pip — in order of preference:
 *   1. `document.currentScript` (works during synchronous script execution)
 *   2. The last `<script src="...pip...">` tag in the document
 *
 * Only used by the auto-mount path.
 */
export function findPipScriptTag(): HTMLScriptElement | null {
  if (typeof document === 'undefined') return null;

  const current = document.currentScript;
  if (current && current instanceof HTMLScriptElement) return current;

  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src]');
  for (let i = scripts.length - 1; i >= 0; i--) {
    const script = scripts[i];
    if (!script) continue;
    const src = script.getAttribute('src') ?? '';
    if (/pip(-help)?[^/]*\.(iife|js|mjs)/i.test(src) || script.dataset['pipEndpoint']) {
      return script;
    }
  }
  return null;
}

export class PipConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipConfigError';
  }
}
