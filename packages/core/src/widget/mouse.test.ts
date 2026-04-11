import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMouse } from './mouse.js';

/**
 * Focused tests for the mouse widget's imperative state machine. We
 * don't try to pixel-assert the rendered cursor — that's a browser e2e
 * concern. What we CAN assert is:
 *
 *   1. The assistant turn handle is a proper state machine with
 *      idempotent finish/error. Streaming deltas after finish() must
 *      be ignored.
 *   2. Error and finish are mutually exclusive: once one fires, the
 *      other is a no-op.
 *   3. Paused state disables the input and blocks form submission.
 *   4. The form emits onSend only when there's non-empty text AND the
 *      widget is neither sending nor paused.
 *   5. moveTo / returnHome apply transforms and manage pill visibility.
 *
 * Each test instantiates a fresh mouse into a detached container so
 * tests don't pollute one another.
 */

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

function makeMouse(overrides: Partial<Parameters<typeof createMouse>[0]> = {}) {
  const onSend = vi.fn();
  const onTogglePause = vi.fn();
  const mouse = createMouse({ onSend, onTogglePause, ...overrides });
  container.appendChild(mouse.element);
  return { mouse, onSend, onTogglePause };
}

describe('mouse widget — form submission', () => {
  it('fires onSend with the trimmed text', () => {
    const { mouse, onSend } = makeMouse();
    const input = mouse.element.querySelector<HTMLInputElement>('.pip-ask-input')!;
    const form = mouse.element.querySelector<HTMLFormElement>('form')!;
    input.value = '  hello world  ';
    form.requestSubmit();
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith('hello world');
  });

  it('clears the input after a successful send', () => {
    const { mouse } = makeMouse();
    const input = mouse.element.querySelector<HTMLInputElement>('.pip-ask-input')!;
    input.value = 'hi';
    mouse.element.querySelector<HTMLFormElement>('form')!.requestSubmit();
    expect(input.value).toBe('');
  });

  it('does not fire onSend for empty text', () => {
    const { mouse, onSend } = makeMouse();
    const input = mouse.element.querySelector<HTMLInputElement>('.pip-ask-input')!;
    input.value = '   ';
    mouse.element.querySelector<HTMLFormElement>('form')!.requestSubmit();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not fire onSend while sending', () => {
    const { mouse, onSend } = makeMouse();
    mouse.setSending(true);
    const input = mouse.element.querySelector<HTMLInputElement>('.pip-ask-input')!;
    input.value = 'hello';
    mouse.element.querySelector<HTMLFormElement>('form')!.requestSubmit();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not fire onSend while paused', () => {
    const { mouse, onSend } = makeMouse();
    mouse.setPaused(true);
    const input = mouse.element.querySelector<HTMLInputElement>('.pip-ask-input')!;
    input.value = 'hello';
    mouse.element.querySelector<HTMLFormElement>('form')!.requestSubmit();
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('mouse widget — paused state', () => {
  it('disables input when paused and updates placeholder', () => {
    const { mouse } = makeMouse();
    mouse.setPaused(true);
    const input = mouse.element.querySelector<HTMLInputElement>('.pip-ask-input')!;
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toContain('paused');
  });

  it('keeps input disabled while sending AND paused, even after setSending(false)', () => {
    // Regression: setSending(false) must not unconditionally re-enable
    // the input while the widget is still paused.
    const { mouse } = makeMouse();
    mouse.setSending(true);
    mouse.setPaused(true);
    mouse.setSending(false);
    const input = mouse.element.querySelector<HTMLInputElement>('.pip-ask-input')!;
    expect(input.disabled).toBe(true);
  });

  it('re-enables input when unpaused', () => {
    const { mouse } = makeMouse();
    mouse.setPaused(true);
    mouse.setPaused(false);
    const input = mouse.element.querySelector<HTMLInputElement>('.pip-ask-input')!;
    expect(input.disabled).toBe(false);
    expect(input.placeholder).toBe('ask pip');
  });

  it('clicking the mouse while paused resumes and fires onTogglePause(false)', () => {
    const { mouse, onTogglePause } = makeMouse();
    mouse.setPaused(true);
    const btn = mouse.element.querySelector<HTMLButtonElement>('.pip-mouse')!;
    btn.click();
    expect(onTogglePause).toHaveBeenCalledWith(false);
    const input = mouse.element.querySelector<HTMLInputElement>('.pip-ask-input')!;
    expect(input.disabled).toBe(false);
  });
});

describe('mouse widget — assistant turn state machine', () => {
  it('startAssistantTurn opens the speech bubble in streaming state', () => {
    const { mouse } = makeMouse();
    mouse.startAssistantTurn();
    const bubble = mouse.element.querySelector('.pip-bubble')!;
    expect(bubble.classList.contains('pip-bubble-streaming')).toBe(true);
    expect((bubble as HTMLElement).style.display).not.toBe('none');
  });

  it('appendText accumulates deltas into the bubble', () => {
    const { mouse } = makeMouse();
    const turn = mouse.startAssistantTurn();
    turn.appendText('Hi ');
    turn.appendText('there');
    turn.appendText('!');
    const bubble = mouse.element.querySelector('.pip-bubble');
    expect(bubble?.textContent).toBe('Hi there!');
  });

  it('finish() removes the streaming class', () => {
    const { mouse } = makeMouse();
    const turn = mouse.startAssistantTurn();
    turn.appendText('Done');
    turn.finish();
    const bubble = mouse.element.querySelector('.pip-bubble')!;
    expect(bubble.classList.contains('pip-bubble-streaming')).toBe(false);
  });

  it('appendText after finish() is a no-op', () => {
    const { mouse } = makeMouse();
    const turn = mouse.startAssistantTurn();
    turn.appendText('Hi');
    turn.finish();
    turn.appendText('!!!'); // should be ignored
    const bubble = mouse.element.querySelector('.pip-bubble');
    expect(bubble?.textContent).toBe('Hi');
  });

  it('finish() on an empty turn renders a (no response) placeholder', () => {
    const { mouse } = makeMouse();
    const turn = mouse.startAssistantTurn();
    turn.finish();
    const bubble = mouse.element.querySelector('.pip-bubble')!;
    expect(bubble.textContent).toBe('(no response)');
    expect(bubble.classList.contains('pip-bubble-empty')).toBe(true);
  });

  it('error() shows the error message and swaps streaming for error class', () => {
    const { mouse } = makeMouse();
    const turn = mouse.startAssistantTurn();
    turn.error('something broke');
    const bubble = mouse.element.querySelector('.pip-bubble')!;
    expect(bubble.classList.contains('pip-bubble-streaming')).toBe(false);
    expect(bubble.classList.contains('pip-bubble-error')).toBe(true);
    expect(bubble.textContent).toBe('something broke');
  });

  it('error() replaces any previously appended text', () => {
    const { mouse } = makeMouse();
    const turn = mouse.startAssistantTurn();
    turn.appendText('partial...');
    turn.error('aborted');
    const bubble = mouse.element.querySelector('.pip-bubble');
    expect(bubble?.textContent).toBe('aborted');
  });

  it('finish() after error() is a no-op (state is sticky)', () => {
    const { mouse } = makeMouse();
    const turn = mouse.startAssistantTurn();
    turn.error('failed');
    turn.finish(); // should not add (no response) placeholder or remove error class
    const bubble = mouse.element.querySelector('.pip-bubble')!;
    expect(bubble.classList.contains('pip-bubble-error')).toBe(true);
    expect(bubble.textContent).toBe('failed');
  });

  it('error() after finish() is a no-op', () => {
    const { mouse } = makeMouse();
    const turn = mouse.startAssistantTurn();
    turn.appendText('OK');
    turn.finish();
    turn.error('should be ignored');
    const bubble = mouse.element.querySelector('.pip-bubble')!;
    expect(bubble.classList.contains('pip-bubble-error')).toBe(false);
    expect(bubble.textContent).toBe('OK');
  });
});

describe('mouse widget — addUserMessage is a no-op in the mouse UX', () => {
  it('does not render the user question anywhere persistent', () => {
    // There's no chat history in the mouse UX — the user just typed the
    // question and they know what they asked. addUserMessage exists only
    // to keep the transport's contract stable.
    const { mouse } = makeMouse();
    mouse.addUserMessage('<script>alert(1)</script>');
    // No user bubble / no injected script.
    expect(mouse.element.querySelector('script')).toBeNull();
    // The speech bubble is still empty / hidden.
    const bubble = mouse.element.querySelector('.pip-bubble') as HTMLElement;
    expect(bubble.style.display).toBe('none');
  });
});

describe('mouse widget — movement', () => {
  it('moveTo applies a transform and hides the ask pill', () => {
    const { mouse } = makeMouse();
    const pill = mouse.element.querySelector('.pip-ask-pill')!;
    mouse.moveTo(300, 400);
    expect((mouse.element as HTMLElement).style.transform).toContain('300px');
    expect((mouse.element as HTMLElement).style.transform).toContain('400px');
    expect(pill.classList.contains('pip-ask-pill-hidden')).toBe(true);
  });

  it('returnHome restores the pill and repositions the mouse to the corner', () => {
    const { mouse } = makeMouse();
    mouse.moveTo(300, 400);
    mouse.returnHome();
    const pill = mouse.element.querySelector('.pip-ask-pill')!;
    expect(pill.classList.contains('pip-ask-pill-hidden')).toBe(false);
    // Home position is viewport-dependent but should not be 300,400 anymore.
    expect((mouse.element as HTMLElement).style.transform).not.toContain('300px');
  });
});

describe('mouse widget — focusInput', () => {
  it('focuses the text input', () => {
    const { mouse } = makeMouse();
    mouse.focusInput();
    const input = mouse.element.querySelector<HTMLInputElement>('.pip-ask-input')!;
    expect(document.activeElement).toBe(input);
  });
});
