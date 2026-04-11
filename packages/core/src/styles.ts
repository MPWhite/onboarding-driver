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

/* Mouse root — the moving anchor that carries the cursor, pill, and bubble.
   Position is driven via CSS transform (translate3d) from JS so we get a
   single composited layer animated on the GPU. "Idle home" is computed at
   mount time to the bottom-right corner. */
.pip-mouse-root {
  position: fixed;
  left: 0;
  top: 0;
  width: 44px;
  height: 44px;
  pointer-events: none;
  /* Smooth walk-to-target. Eased so the first few pixels move fast and the
     last few settle — reads as a "pointing gesture" rather than a drift. */
  transition: transform 560ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

/* Mouse cursor itself — absolute-centered on the root so transforms move
   it cleanly without fighting with the pill/bubble children. */
.pip-mouse {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--pip-bg);
  color: var(--pip-fg);
  border: 1px solid var(--pip-border);
  box-shadow: var(--pip-shadow);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  pointer-events: auto;
  transition: filter 200ms ease, transform 120ms ease;
}

.pip-mouse:hover {
  transform: translate(-50%, calc(-50% - 2px));
}

.pip-mouse svg {
  width: 24px;
  height: 24px;
}

.pip-mouse-paused {
  filter: grayscale(1) opacity(0.55);
}

/* Sending — a soft pulse on the cursor so the user knows pip is working
   even before the speech bubble opens. */
.pip-mouse-sending {
  animation: pip-mouse-pulse 1.2s ease-in-out infinite;
}

@keyframes pip-mouse-pulse {
  0%, 100% {
    box-shadow: var(--pip-shadow);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.18), var(--pip-shadow);
  }
}

/* Ask pill — always-visible input anchored to the left of the mouse in
   its idle corner. Hidden whenever the mouse walks off to a target. */
.pip-ask-pill {
  position: absolute;
  right: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  width: 180px;
  background: var(--pip-bg);
  border: 1px solid var(--pip-border);
  border-radius: 999px;
  box-shadow: var(--pip-shadow);
  padding: 6px 12px;
  pointer-events: auto;
  transition: opacity 200ms ease, transform 200ms ease;
  opacity: 1;
}

.pip-ask-pill-hidden {
  opacity: 0;
  transform: translateY(-50%) scale(0.92);
  pointer-events: none;
}

.pip-ask-input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  color: var(--pip-fg);
  min-width: 0;
}

.pip-ask-input::placeholder {
  color: var(--pip-muted);
}

.pip-ask-input:disabled {
  color: var(--pip-muted);
  cursor: not-allowed;
}

/* Speech bubble — hangs above the mouse by default. Fixed max width so
   long answers wrap rather than stretching across the viewport. */
.pip-bubble {
  position: absolute;
  bottom: calc(100% + 14px);
  left: 50%;
  transform: translateX(-50%);
  max-width: 260px;
  min-width: 120px;
  width: max-content;
  padding: 10px 14px;
  background: var(--pip-bg);
  color: var(--pip-fg);
  border: 1px solid var(--pip-border);
  border-radius: 14px;
  box-shadow: var(--pip-shadow);
  font-size: 13.5px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-wrap: break-word;
  pointer-events: auto;
}

/* Tail — small triangle pointing from the bubble toward the mouse. */
.pip-bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--pip-bg);
  filter: drop-shadow(0 1px 0 var(--pip-border));
}

.pip-bubble-streaming::before {
  content: '▌';
  display: inline-block;
  margin-left: 2px;
  animation: pip-blink 1s infinite;
  color: var(--pip-muted);
}

@keyframes pip-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.pip-bubble-empty {
  color: var(--pip-muted);
  font-style: italic;
}

.pip-bubble-error {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.35);
}

/* Consent dialog */
.pip-consent-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  place-items: center;
  padding: 20px;
}

.pip-consent-dialog {
  max-width: 400px;
  width: 100%;
  background: var(--pip-bg);
  color: var(--pip-fg);
  border-radius: var(--pip-radius);
  padding: 24px;
  box-shadow: var(--pip-shadow);
}

.pip-consent-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
}

.pip-consent-body {
  margin: 0 0 12px 0;
  font-size: 13.5px;
  line-height: 1.5;
}

.pip-consent-muted {
  color: var(--pip-muted);
}

.pip-consent-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

.pip-btn {
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--pip-border);
  background: var(--pip-bg);
  color: var(--pip-fg);
  font-family: inherit;
  transition: transform 100ms ease;
}

.pip-btn:hover {
  transform: translateY(-1px);
}

.pip-btn-primary {
  background: var(--pip-accent);
  color: var(--pip-accent-fg);
  border-color: var(--pip-accent);
}

.pip-btn-ghost {
  background: transparent;
}

/* Pointing overlay */
.pip-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483001;
}

.pip-overlay-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.pip-overlay-ring {
  animation: pip-pulse-ring 1.4s ease-in-out infinite;
}

@keyframes pip-pulse-ring {
  0%, 100% { opacity: 0.9; stroke-width: 3; }
  50% { opacity: 0.5; stroke-width: 5; }
}

.pip-overlay-caption {
  position: absolute;
  background: var(--pip-bg);
  color: var(--pip-fg);
  border: 1px solid var(--pip-border);
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: var(--pip-shadow);
  font-size: 13.5px;
  line-height: 1.4;
  pointer-events: none;
  max-width: 240px;
}
`;
