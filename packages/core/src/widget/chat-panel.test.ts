import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createChatPanel } from './chat-panel.js';

/**
 * Focused tests for chat-panel's imperative state machine. We don't
 * try to pixel-assert the rendered UI — that lives in a browser e2e
 * test we haven't built yet. What we CAN assert is:
 *
 *   1. The assistant turn handle is a proper state machine with idempotent
 *      finish/error. Streaming deltas after finish() must be ignored.
 *   2. Error and finish are mutually exclusive: once one fires, the other
 *      is a no-op.
 *   3. Paused state correctly disables the input/send button and blocks
 *      form submission.
 *   4. The form emits onSend only when there's non-empty text AND the
 *      panel is neither sending nor paused.
 *
 * Each test instantiates a fresh panel into a detached container so
 * tests don't pollute one another.
 */

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

function makePanel(overrides: Partial<Parameters<typeof createChatPanel>[0]> = {}) {
  const onSend = vi.fn();
  const onClose = vi.fn();
  const onTogglePause = vi.fn();
  const panel = createChatPanel({ onSend, onClose, onTogglePause, ...overrides });
  container.appendChild(panel.element);
  return { panel, onSend, onClose, onTogglePause };
}

describe('chat panel — form submission', () => {
  it('fires onSend with the trimmed text', () => {
    const { panel, onSend } = makePanel();
    panel.show();
    const textarea = panel.element.querySelector('textarea')!;
    const form = panel.element.querySelector('form')!;
    textarea.value = '  hello world  ';
    form.requestSubmit();
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith('hello world');
  });

  it('clears the textarea after a successful send', () => {
    const { panel } = makePanel();
    panel.show();
    const textarea = panel.element.querySelector('textarea')!;
    textarea.value = 'hi';
    panel.element.querySelector('form')!.requestSubmit();
    expect(textarea.value).toBe('');
  });

  it('does not fire onSend for empty text', () => {
    const { panel, onSend } = makePanel();
    panel.show();
    const textarea = panel.element.querySelector('textarea')!;
    textarea.value = '   ';
    panel.element.querySelector('form')!.requestSubmit();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not fire onSend while sending', () => {
    const { panel, onSend } = makePanel();
    panel.show();
    panel.setSending(true);
    const textarea = panel.element.querySelector('textarea')!;
    textarea.value = 'hello';
    panel.element.querySelector('form')!.requestSubmit();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not fire onSend while paused', () => {
    const { panel, onSend } = makePanel();
    panel.show();
    panel.setPaused(true);
    const textarea = panel.element.querySelector('textarea')!;
    textarea.value = 'hello';
    panel.element.querySelector('form')!.requestSubmit();
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('chat panel — paused state', () => {
  it('disables textarea and send button when paused', () => {
    const { panel } = makePanel();
    panel.show();
    panel.setPaused(true);
    const textarea = panel.element.querySelector<HTMLTextAreaElement>('textarea')!;
    const send = panel.element.querySelector<HTMLButtonElement>('.pip-send')!;
    expect(textarea.disabled).toBe(true);
    expect(send.disabled).toBe(true);
  });

  it('keeps textarea disabled while sending AND paused, even after setSending(false)', () => {
    // This is the regression test for the earlier bug where setSending(false)
    // was unconditionally re-enabling the textarea, overriding paused.
    const { panel } = makePanel();
    panel.show();
    panel.setSending(true);
    panel.setPaused(true);
    panel.setSending(false);
    const textarea = panel.element.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(textarea.disabled).toBe(true);
  });

  it('re-enables textarea when unpaused', () => {
    const { panel } = makePanel();
    panel.show();
    panel.setPaused(true);
    panel.setPaused(false);
    const textarea = panel.element.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(textarea.disabled).toBe(false);
  });
});

describe('chat panel — user messages', () => {
  it('renders a user message as a .pip-msg-user bubble with text', () => {
    const { panel } = makePanel();
    panel.show();
    panel.addUserMessage('Hello there');
    const bubble = panel.element.querySelector('.pip-msg-user');
    expect(bubble).toBeTruthy();
    expect(bubble?.textContent).toBe('Hello there');
  });

  it('renders user message text via textContent (no HTML injection)', () => {
    const { panel } = makePanel();
    panel.show();
    panel.addUserMessage('<script>alert(1)</script>');
    const bubble = panel.element.querySelector('.pip-msg-user');
    expect(bubble?.textContent).toBe('<script>alert(1)</script>');
    expect(panel.element.querySelector('script')).toBeNull();
  });

  it('removes the empty-state placeholder on first message', () => {
    const { panel } = makePanel();
    panel.show();
    expect(panel.element.querySelector('.pip-empty-state')).toBeTruthy();
    panel.addUserMessage('first');
    expect(panel.element.querySelector('.pip-empty-state')).toBeNull();
  });
});

describe('chat panel — assistant turn state machine', () => {
  it('startAssistantTurn creates a streaming assistant bubble', () => {
    const { panel } = makePanel();
    panel.show();
    panel.startAssistantTurn();
    const bubble = panel.element.querySelector('.pip-msg-assistant');
    expect(bubble).toBeTruthy();
    expect(bubble?.classList.contains('pip-msg-streaming')).toBe(true);
  });

  it('appendText accumulates deltas into the bubble body', () => {
    const { panel } = makePanel();
    panel.show();
    const turn = panel.startAssistantTurn();
    turn.appendText('Hi ');
    turn.appendText('there');
    turn.appendText('!');
    const body = panel.element.querySelector('.pip-msg-assistant .pip-msg-body');
    expect(body?.textContent).toBe('Hi there!');
  });

  it('finish() removes the streaming class', () => {
    const { panel } = makePanel();
    panel.show();
    const turn = panel.startAssistantTurn();
    turn.appendText('Done');
    turn.finish();
    const bubble = panel.element.querySelector('.pip-msg-assistant');
    expect(bubble?.classList.contains('pip-msg-streaming')).toBe(false);
  });

  it('appendText after finish() is a no-op', () => {
    const { panel } = makePanel();
    panel.show();
    const turn = panel.startAssistantTurn();
    turn.appendText('Hi');
    turn.finish();
    turn.appendText('!!!'); // should be ignored
    const body = panel.element.querySelector('.pip-msg-assistant .pip-msg-body');
    expect(body?.textContent).toBe('Hi');
  });

  it('finish() on an empty turn renders a (no response) placeholder', () => {
    const { panel } = makePanel();
    panel.show();
    const turn = panel.startAssistantTurn();
    turn.finish();
    const body = panel.element.querySelector('.pip-msg-assistant .pip-msg-body');
    expect(body?.textContent).toBe('(no response)');
    expect(body?.classList.contains('pip-msg-empty')).toBe(true);
  });

  it('error() shows the error message and removes streaming state', () => {
    const { panel } = makePanel();
    panel.show();
    const turn = panel.startAssistantTurn();
    turn.error('something broke');
    const bubble = panel.element.querySelector('.pip-msg-assistant');
    expect(bubble?.classList.contains('pip-msg-streaming')).toBe(false);
    expect(bubble?.classList.contains('pip-msg-error')).toBe(true);
    expect(bubble?.textContent).toBe('something broke');
  });

  it('error() replaces any previously appended text', () => {
    const { panel } = makePanel();
    panel.show();
    const turn = panel.startAssistantTurn();
    turn.appendText('partial...');
    turn.error('aborted');
    const body = panel.element.querySelector('.pip-msg-assistant .pip-msg-body');
    expect(body?.textContent).toBe('aborted');
  });

  it('finish() after error() is a no-op (state is sticky)', () => {
    const { panel } = makePanel();
    panel.show();
    const turn = panel.startAssistantTurn();
    turn.error('failed');
    turn.finish(); // should not add (no response) placeholder or remove error class
    const bubble = panel.element.querySelector('.pip-msg-assistant');
    expect(bubble?.classList.contains('pip-msg-error')).toBe(true);
    expect(bubble?.textContent).toBe('failed');
  });

  it('error() after finish() is a no-op', () => {
    const { panel } = makePanel();
    panel.show();
    const turn = panel.startAssistantTurn();
    turn.appendText('OK');
    turn.finish();
    turn.error('should be ignored');
    const bubble = panel.element.querySelector('.pip-msg-assistant');
    expect(bubble?.classList.contains('pip-msg-error')).toBe(false);
    expect(bubble?.textContent).toBe('OK');
  });
});

describe('chat panel — show/hide/focus', () => {
  it('starts hidden', () => {
    const { panel } = makePanel();
    expect(panel.isVisible()).toBe(false);
  });

  it('show() displays the panel', () => {
    const { panel } = makePanel();
    panel.show();
    expect(panel.isVisible()).toBe(true);
  });

  it('hide() hides the panel', () => {
    const { panel } = makePanel();
    panel.show();
    panel.hide();
    expect(panel.isVisible()).toBe(false);
  });

  it('close button fires onClose', () => {
    const { panel, onClose } = makePanel();
    panel.show();
    panel.element.querySelector<HTMLButtonElement>('[data-action="close"]')!.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('pause button fires onTogglePause with the new state', () => {
    const { panel, onTogglePause } = makePanel();
    panel.show();
    const pauseBtn = panel.element.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
    pauseBtn.click();
    expect(onTogglePause).toHaveBeenCalledWith(true);
    pauseBtn.click();
    expect(onTogglePause).toHaveBeenCalledWith(false);
  });

  it('Escape key on the panel fires onClose', () => {
    const { panel, onClose } = makePanel();
    panel.show();
    panel.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
