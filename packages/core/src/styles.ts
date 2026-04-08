/**
 * CSS for the pip widget's Shadow DOM.
 *
 * Lives as a plain TypeScript string so it:
 *   - Bundles trivially into both ESM and IIFE without a CSS loader
 *   - Can be injected into a Shadow DOM `<style>` element (document-level
 *     stylesheets don't penetrate shadow boundaries, which is exactly what
 *     we want — the host site's CSS can't touch us, and our CSS can't
 *     accidentally leak onto the host).
 *
 * Visual language is deliberately neutral — rounded corners, soft shadows,
 * system font stack — so it looks "native" in whatever site embeds it.
 * Light/dark is handled by `prefers-color-scheme`.
 */
export const PIP_STYLES = /* css */ `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1a1a1a;
  --pip-bg: #ffffff;
  --pip-fg: #1a1a1a;
  --pip-muted: #6b7280;
  --pip-border: #e5e7eb;
  --pip-accent: #4f46e5;
  --pip-accent-fg: #ffffff;
  --pip-shadow: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
  --pip-radius: 16px;
}

@media (prefers-color-scheme: dark) {
  :host {
    color: #f3f4f6;
    --pip-bg: #1f1f23;
    --pip-fg: #f3f4f6;
    --pip-muted: #9ca3af;
    --pip-border: #2e2e33;
    --pip-accent: #818cf8;
    --pip-accent-fg: #0b0b0f;
    --pip-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3);
  }
}

*, *::before, *::after {
  box-sizing: border-box;
}

.pip-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483000;
}

.pip-root > * {
  pointer-events: auto;
}

/* Mouse button — the floating entry point */
.pip-button {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--pip-bg);
  color: var(--pip-fg);
  border: 1px solid var(--pip-border);
  box-shadow: var(--pip-shadow);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
  padding: 0;
}

.pip-button:hover {
  transform: translateY(-2px);
}

.pip-button svg {
  width: 28px;
  height: 28px;
}
`;
