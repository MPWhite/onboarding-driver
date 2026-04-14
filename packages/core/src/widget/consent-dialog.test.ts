import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createConsentDialog,
  readConsent,
  writeConsent,
  clearConsent,
} from './consent-dialog.js';

/**
 * Tests for the consent dialog. The dialog is small — just two buttons,
 * a backdrop, and a localStorage persistence layer — but every path
 * matters because this is the first-use gate for every pip user.
 */

beforeEach(() => {
  document.body.innerHTML = '';
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('consent persistence', () => {
  it('readConsent returns null when nothing is stored', () => {
    expect(readConsent()).toBeNull();
  });

  it('writeConsent + readConsent round-trips a granted value', () => {
    writeConsent('granted');
    expect(readConsent()).toBe('granted');
  });

  it('writeConsent + readConsent round-trips a denied value', () => {
    writeConsent('denied');
    expect(readConsent()).toBe('denied');
  });

  it('clearConsent removes the record', () => {
    writeConsent('granted');
    clearConsent();
    expect(readConsent()).toBeNull();
  });

  it('readConsent returns null on corrupt JSON in localStorage', () => {
    localStorage.setItem('pip-consent', 'not-json');
    expect(readConsent()).toBeNull();
  });

  it('readConsent returns null on unknown value in the stored record', () => {
    localStorage.setItem(
      'pip-consent',
      JSON.stringify({ value: 'maybe', timestamp: Date.now() }),
    );
    expect(readConsent()).toBeNull();
  });

  it('readConsent tolerates localStorage being blocked (returns null, no throw)', () => {
    const realGet = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => readConsent()).not.toThrow();
      expect(readConsent()).toBeNull();
    } finally {
      Storage.prototype.getItem = realGet;
    }
  });

  it('writeConsent tolerates localStorage being blocked (no throw)', () => {
    const realSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => writeConsent('granted')).not.toThrow();
    } finally {
      Storage.prototype.setItem = realSet;
    }
  });
});

describe('createConsentDialog', () => {
  it('renders hidden by default', () => {
    const dialog = createConsentDialog({
      onAccept: vi.fn(),
      onDecline: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(dialog.element);
    expect(dialog.element.style.display).toBe('none');
  });

  it('show() makes the dialog visible', () => {
    const dialog = createConsentDialog({
      onAccept: vi.fn(),
      onDecline: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(dialog.element);
    dialog.show();
    expect(dialog.element.style.display).toBe('grid');
  });

  it('hide() returns to hidden state', () => {
    const dialog = createConsentDialog({
      onAccept: vi.fn(),
      onDecline: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(dialog.element);
    dialog.show();
    dialog.hide();
    expect(dialog.element.style.display).toBe('none');
  });

  it('clicking "Sounds good" stores granted + fires onAccept + hides', () => {
    const onAccept = vi.fn();
    const dialog = createConsentDialog({
      onAccept,
      onDecline: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(dialog.element);
    dialog.show();
    dialog.element
      .querySelector<HTMLButtonElement>('[data-action="accept"]')!
      .click();
    expect(onAccept).toHaveBeenCalledOnce();
    expect(readConsent()).toBe('granted');
    expect(dialog.element.style.display).toBe('none');
  });

  it('clicking "No thanks" stores denied + fires onDecline + hides', () => {
    const onDecline = vi.fn();
    const dialog = createConsentDialog({
      onAccept: vi.fn(),
      onDecline,
      onClose: vi.fn(),
    });
    document.body.appendChild(dialog.element);
    dialog.show();
    dialog.element
      .querySelector<HTMLButtonElement>('[data-action="decline"]')!
      .click();
    expect(onDecline).toHaveBeenCalledOnce();
    expect(readConsent()).toBe('denied');
    expect(dialog.element.style.display).toBe('none');
  });

  it('clicking the backdrop fires onClose without writing consent', () => {
    const onClose = vi.fn();
    const dialog = createConsentDialog({
      onAccept: vi.fn(),
      onDecline: vi.fn(),
      onClose,
    });
    document.body.appendChild(dialog.element);
    dialog.show();
    // Dispatch a click whose target is the backdrop itself (not a child)
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: dialog.element });
    dialog.element.dispatchEvent(event);
    expect(onClose).toHaveBeenCalledOnce();
    expect(readConsent()).toBeNull();
  });

  it('Escape key dismisses + fires onClose without writing consent', () => {
    const onClose = vi.fn();
    const dialog = createConsentDialog({
      onAccept: vi.fn(),
      onDecline: vi.fn(),
      onClose,
    });
    document.body.appendChild(dialog.element);
    dialog.show();
    const innerDialog = dialog.element.querySelector('.pip-consent-dialog')!;
    innerDialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(readConsent()).toBeNull();
    expect(dialog.element.style.display).toBe('none');
  });

  it('Tab cycles focus from accept to decline and back (focus trap)', () => {
    const dialog = createConsentDialog({
      onAccept: vi.fn(),
      onDecline: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(dialog.element);
    dialog.show();

    const acceptBtn = dialog.element.querySelector<HTMLButtonElement>(
      '[data-action="accept"]',
    )!;
    const declineBtn = dialog.element.querySelector<HTMLButtonElement>(
      '[data-action="decline"]',
    )!;
    const innerDialog = dialog.element.querySelector('.pip-consent-dialog')!;

    // Accept button is focused on show()
    expect(document.activeElement).toBe(acceptBtn);

    // Tab from accept → decline
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    Object.defineProperty(tabEvent, 'target', { value: acceptBtn });
    innerDialog.dispatchEvent(tabEvent);
    // After our synthetic focus trap, declineBtn should have focus
    expect(document.activeElement).toBe(declineBtn);

    // Shift+Tab from decline → accept
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    });
    Object.defineProperty(shiftTab, 'target', { value: declineBtn });
    innerDialog.dispatchEvent(shiftTab);
    expect(document.activeElement).toBe(acceptBtn);
  });

  it('Tab from decline wraps back to accept (focus trap wraps)', () => {
    const dialog = createConsentDialog({
      onAccept: vi.fn(),
      onDecline: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(dialog.element);
    dialog.show();

    const acceptBtn = dialog.element.querySelector<HTMLButtonElement>(
      '[data-action="accept"]',
    )!;
    const declineBtn = dialog.element.querySelector<HTMLButtonElement>(
      '[data-action="decline"]',
    )!;
    const innerDialog = dialog.element.querySelector('.pip-consent-dialog')!;

    // Tab from decline → accept (wraps around)
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    Object.defineProperty(tabEvent, 'target', { value: declineBtn });
    innerDialog.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(acceptBtn);
  });

  it('Shift+Tab from accept wraps back to decline (focus trap wraps)', () => {
    const dialog = createConsentDialog({
      onAccept: vi.fn(),
      onDecline: vi.fn(),
      onClose: vi.fn(),
    });
    document.body.appendChild(dialog.element);
    dialog.show();

    const acceptBtn = dialog.element.querySelector<HTMLButtonElement>(
      '[data-action="accept"]',
    )!;
    const declineBtn = dialog.element.querySelector<HTMLButtonElement>(
      '[data-action="decline"]',
    )!;
    const innerDialog = dialog.element.querySelector('.pip-consent-dialog')!;

    // Shift+Tab from accept → decline (wraps around)
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    });
    Object.defineProperty(shiftTab, 'target', { value: acceptBtn });
    innerDialog.dispatchEvent(shiftTab);
    expect(document.activeElement).toBe(declineBtn);
  });

  it('dialog has the required a11y attributes', () => {
    const dialog = createConsentDialog({
      onAccept: vi.fn(),
      onDecline: vi.fn(),
      onClose: vi.fn(),
    });
    const innerDialog = dialog.element.querySelector('.pip-consent-dialog')!;
    expect(innerDialog.getAttribute('role')).toBe('dialog');
    expect(innerDialog.getAttribute('aria-modal')).toBe('true');
    expect(innerDialog.getAttribute('aria-labelledby')).toBeTruthy();
  });
});
