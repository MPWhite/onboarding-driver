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

/* Chat panel */
.pip-panel {
  position: fixed;
  right: 20px;
  bottom: 90px;
  width: min(380px, calc(100vw - 40px));
  height: min(560px, calc(100vh - 120px));
  background: var(--pip-bg);
  color: var(--pip-fg);
  border: 1px solid var(--pip-border);
  border-radius: var(--pip-radius);
  box-shadow: var(--pip-shadow);
  flex-direction: column;
  overflow: hidden;
}

.pip-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--pip-border);
  flex-shrink: 0;
}

.pip-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.pip-panel-title-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pip-accent);
}

.pip-panel-header-actions {
  display: flex;
  gap: 4px;
}

.pip-panel-iconbtn {
  background: transparent;
  border: 0;
  color: var(--pip-muted);
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 100ms ease, color 100ms ease;
}

.pip-panel-iconbtn:hover {
  background: var(--pip-border);
  color: var(--pip-fg);
}

.pip-panel-iconbtn-active {
  background: var(--pip-accent);
  color: var(--pip-accent-fg);
}

.pip-panel-iconbtn-active:hover {
  background: var(--pip-accent);
  color: var(--pip-accent-fg);
  opacity: 0.9;
}

/* Messages */
.pip-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pip-empty-state {
  color: var(--pip-muted);
  text-align: center;
  padding: 24px 12px;
  font-size: 13px;
}

.pip-msg {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 13.5px;
  white-space: pre-wrap;
  word-wrap: break-word;
  line-height: 1.45;
}

.pip-msg-user {
  align-self: flex-end;
  background: var(--pip-accent);
  color: var(--pip-accent-fg);
  border-bottom-right-radius: 4px;
}

.pip-msg-assistant {
  align-self: flex-start;
  background: var(--pip-border);
  color: var(--pip-fg);
  border-bottom-left-radius: 4px;
}

.pip-msg-assistant.pip-msg-streaming::after {
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

.pip-msg-empty {
  color: var(--pip-muted);
  font-style: italic;
}

.pip-msg-error {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.pip-msg-system {
  align-self: center;
  font-size: 12px;
  color: var(--pip-muted);
  padding: 4px 10px;
  text-align: center;
  max-width: 85%;
}

/* Input form */
.pip-input-form {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--pip-border);
  align-items: flex-end;
  flex-shrink: 0;
}

.pip-input {
  flex: 1;
  resize: none;
  border: 1px solid var(--pip-border);
  border-radius: 10px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13.5px;
  color: var(--pip-fg);
  background: var(--pip-bg);
  outline: none;
  transition: border-color 100ms ease;
  max-height: 160px;
  min-height: 36px;
  line-height: 1.4;
}

.pip-input:focus {
  border-color: var(--pip-accent);
}

.pip-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pip-send {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--pip-accent);
  color: var(--pip-accent-fg);
  border: 0;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: transform 100ms ease, opacity 100ms ease;
}

.pip-send:hover:not(:disabled) {
  transform: translateY(-1px);
}

.pip-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pip-send-loading svg {
  animation: pip-pulse 1s ease-in-out infinite;
}

@keyframes pip-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
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
