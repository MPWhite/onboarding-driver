/**
 * First-use consent dialog.
 *
 * Shown once per origin (consent is persisted in localStorage under
 * `pip-consent`). The dialog tells the user what pip is about to do —
 * share a screenshot of this page with an AI assistant — and lets them
 * accept, decline, or close without deciding.
 *
 * Declining stores a "denied" consent record that prevents the chat panel
 * from ever sending a request until the user toggles pause off explicitly,
 * which is the closest thing to an undo we offer. Users who close without
 * deciding get the dialog again next time.
 */

const CONSENT_KEY = 'pip-consent';

type ConsentValue = 'granted' | 'denied';

interface ConsentRecord {
  value: ConsentValue;
  timestamp: number;
}

export function readConsent(): ConsentValue | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed.value === 'granted' || parsed.value === 'denied') {
      return parsed.value;
    }
    return null;
  } catch {
    // localStorage blocked (private mode, cross-origin iframes, etc.).
    // Treat as "no decision yet" — we'll re-prompt on every session,
    // which is the most honest fallback.
    return null;
  }
}

export function writeConsent(value: ConsentValue): void {
  try {
    const record: ConsentRecord = { value, timestamp: Date.now() };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // Silently ignore — see readConsent() comment.
  }
}

export function clearConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Ignore.
  }
}

export interface ConsentDialogHandle {
  element: HTMLElement;
  show(): void;
  hide(): void;
}

export interface ConsentDialogOptions {
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}

export function createConsentDialog(options: ConsentDialogOptions): ConsentDialogHandle {
  const backdrop = document.createElement('div');
  backdrop.className = 'pip-consent-backdrop';
  backdrop.style.display = 'none';

  const dialog = document.createElement('div');
  dialog.className = 'pip-consent-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'pip-consent-title');

  dialog.innerHTML = /* html */ `
    <h2 id="pip-consent-title" class="pip-consent-title">Meet pip</h2>
    <p class="pip-consent-body">
      pip is a little helper you can ask questions about this page. To answer,
      it will share a <strong>screenshot of what you're currently looking at</strong>
      (with password fields automatically hidden) with an AI assistant.
    </p>
    <p class="pip-consent-body pip-consent-muted">
      You can pause or close pip at any time using the controls in the chat
      window.
    </p>
    <div class="pip-consent-actions">
      <button type="button" class="pip-btn pip-btn-ghost" data-action="decline">No thanks</button>
      <button type="button" class="pip-btn pip-btn-primary" data-action="accept">Sounds good</button>
    </div>
  `;

  backdrop.appendChild(dialog);

  const acceptBtn = dialog.querySelector<HTMLButtonElement>('[data-action="accept"]');
  const declineBtn = dialog.querySelector<HTMLButtonElement>('[data-action="decline"]');

  acceptBtn?.addEventListener('click', () => {
    writeConsent('granted');
    hide();
    options.onAccept();
  });
  declineBtn?.addEventListener('click', () => {
    writeConsent('denied');
    hide();
    options.onDecline();
  });
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      hide();
      options.onClose();
    }
  });

  // Keyboard handling inside the dialog:
  //   - Escape dismisses without deciding (same as backdrop click)
  //   - Tab and Shift+Tab cycle between the two buttons — simple focus
  //     trap that's enough for our two-button dialog. A general trap
  //     would enumerate all focusable descendants, but we know the
  //     entire interactive surface is just these two buttons.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hide();
      options.onClose();
      return;
    }
    if (event.key === 'Tab') {
      const active = (event.target as HTMLElement) ?? null;
      if (event.shiftKey) {
        if (active === declineBtn) {
          event.preventDefault();
          acceptBtn?.focus();
        }
      } else {
        if (active === acceptBtn) {
          event.preventDefault();
          declineBtn?.focus();
        }
      }
    }
  });

  function show(): void {
    backdrop.style.display = 'grid';
    acceptBtn?.focus();
  }
  function hide(): void {
    backdrop.style.display = 'none';
  }

  return { element: backdrop, show, hide };
}
