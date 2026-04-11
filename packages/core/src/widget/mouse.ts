/**
 * The mouse widget — pip's primary surface.
 *
 * Three elements travel together inside a single fixed-position root:
 *   1. The mouse SVG itself — a small cursor-character that can animate
 *      across the viewport via CSS transform.
 *   2. An always-visible "ask pip" input pill anchored next to the mouse
 *      while it sits in its idle corner. The pill hides when the mouse
 *      walks to a pointing target so it doesn't drag halfway across the
 *      page with the cursor.
 *   3. A speech bubble that hangs off the mouse and renders streaming
 *      assistant text. Same bubble is reused for both text-only answers
 *      (mouse stays in corner, bubble streams the reply) and pointing
 *      answers (mouse walks to target, bubble becomes the caption). The
 *      overlay's own caption is suppressed in the pointing case so we
 *      don't double-render.
 *
 * This file owns no network or capture logic — it only exposes an
 * imperative API the transport controller drives. The transport doesn't
 * know or care that the chat panel was replaced.
 */

import type { AssistantTurnHandle } from './assistant-turn.js';

export interface MouseHandle {
  element: HTMLElement;
  focusInput(): void;
  setPaused(paused: boolean): void;
  setSending(sending: boolean): void;
  addUserMessage(text: string): void;
  startAssistantTurn(): AssistantTurnHandle;
  /** Animate the mouse to a viewport-pixel coordinate (target center). */
  moveTo(x: number, y: number): void;
  /** Animate the mouse back to its idle corner. */
  returnHome(): void;
  destroy(): void;
}

export interface MouseOptions {
  onSend: (text: string) => void;
  onTogglePause: (paused: boolean) => void;
}

const MOUSE_SIZE = 44;
const HOME_MARGIN = 24;
/** How long the cursor has to sit still at home before the idle wiggle kicks in. */
const IDLE_WIGGLE_DELAY_MS = 4000;
/** Enough vertical room above the mouse to comfortably flip the bubble upward. */
const BUBBLE_FLIP_THRESHOLD = 120;

export function createMouse(options: MouseOptions): MouseHandle {
  const root = document.createElement('div');
  root.className = 'pip-mouse-root';

  const mouse = document.createElement('button');
  mouse.className = 'pip-mouse';
  mouse.type = 'button';
  mouse.setAttribute('aria-label', 'pip assistant — click to focus the ask input');
  mouse.innerHTML = MOUSE_SVG;

  const pill = document.createElement('form');
  pill.className = 'pip-ask-pill';
  pill.innerHTML = /* html */ `
    <input
      type="text"
      class="pip-ask-input"
      placeholder="ask pip"
      aria-label="Ask pip a question"
      autocomplete="off"
    />
  `;
  const input = pill.querySelector<HTMLInputElement>('.pip-ask-input')!;

  const bubble = document.createElement('div');
  bubble.className = 'pip-bubble';
  bubble.setAttribute('role', 'status');
  bubble.style.display = 'none';

  root.appendChild(bubble);
  root.appendChild(pill);
  root.appendChild(mouse);

  let currentX = 0;
  let currentY = 0;
  let atHome = true;
  let paused = false;
  let sending = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function computeHome(): { x: number; y: number } {
    return {
      x: window.innerWidth - HOME_MARGIN - MOUSE_SIZE / 2,
      y: window.innerHeight - HOME_MARGIN - MOUSE_SIZE / 2,
    };
  }

  function applyPosition(x: number, y: number): void {
    currentX = x;
    currentY = y;
    root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    // When the cursor moves to a new spot, the bubble may no longer
    // have room above it. Re-pick the bubble side for the new y.
    updateBubbleSide();
  }

  /**
   * Decide whether the speech bubble hangs above or below the mouse.
   * Default is above (looks like a thought balloon rising from the
   * cursor). When the cursor is near the top of the viewport we flip
   * below so the bubble doesn't get clipped off-screen.
   */
  function updateBubbleSide(): void {
    if (currentY < BUBBLE_FLIP_THRESHOLD) {
      bubble.classList.add('pip-bubble-below');
    } else {
      bubble.classList.remove('pip-bubble-below');
    }
  }

  function scheduleIdleWiggle(): void {
    clearIdleWiggle();
    if (!atHome || paused || sending) return;
    idleTimer = setTimeout(() => {
      // Only start wiggling if still idle at home — the timer could
      // have been scheduled before a new turn began.
      if (atHome && !paused && !sending) {
        mouse.classList.add('pip-mouse-idle-wiggling');
      }
    }, IDLE_WIGGLE_DELAY_MS);
  }

  function clearIdleWiggle(): void {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    mouse.classList.remove('pip-mouse-idle-wiggling');
  }

  function moveTo(x: number, y: number): void {
    atHome = false;
    clearIdleWiggle();
    pill.classList.add('pip-ask-pill-hidden');
    applyPosition(x, y);
  }

  function returnHome(): void {
    atHome = true;
    pill.classList.remove('pip-ask-pill-hidden');
    const home = computeHome();
    applyPosition(home.x, home.y);
    scheduleIdleWiggle();
  }

  function showBubble(): void {
    bubble.style.display = '';
  }

  function hideBubble(): void {
    bubble.style.display = 'none';
    bubble.textContent = '';
    bubble.classList.remove('pip-bubble-streaming', 'pip-bubble-error', 'pip-bubble-empty');
  }

  function startAssistantTurn(): AssistantTurnHandle {
    bubble.textContent = '';
    bubble.classList.remove('pip-bubble-error', 'pip-bubble-empty');
    bubble.classList.add('pip-bubble-streaming');
    showBubble();

    let closed = false;
    return {
      appendText(delta: string): void {
        if (closed) return;
        bubble.textContent = (bubble.textContent ?? '') + delta;
      },
      finish(): void {
        if (closed) return;
        closed = true;
        bubble.classList.remove('pip-bubble-streaming');
        if (!bubble.textContent) {
          bubble.textContent = '(no response)';
          bubble.classList.add('pip-bubble-empty');
        }
      },
      error(message: string): void {
        if (closed) return;
        closed = true;
        bubble.classList.remove('pip-bubble-streaming');
        bubble.classList.add('pip-bubble-error');
        bubble.textContent = message;
      },
    };
  }

  function setPaused(next: boolean): void {
    paused = next;
    mouse.classList.toggle('pip-mouse-paused', paused);
    input.disabled = paused;
    input.placeholder = paused ? 'paused — click mouse to resume' : 'ask pip';
    if (paused) {
      clearIdleWiggle();
    } else {
      scheduleIdleWiggle();
    }
  }

  function setSending(next: boolean): void {
    sending = next;
    input.disabled = sending || paused;
    mouse.classList.toggle('pip-mouse-sending', sending);
    if (sending) {
      clearIdleWiggle();
    } else {
      scheduleIdleWiggle();
    }
  }

  function addUserMessage(_text: string): void {
    // No-op. In the mouse UX there is no chat history — the user just
    // typed the question, they know what they asked. Kept on the handle
    // so the transport controller's contract is stable.
  }

  // Any keystroke in the pill counts as "user is engaged" — bail on
  // the wiggle so pip doesn't twitch while someone's mid-sentence.
  input.addEventListener('input', () => {
    clearIdleWiggle();
    scheduleIdleWiggle();
  });
  input.addEventListener('focus', () => {
    clearIdleWiggle();
  });

  // Submit handler
  pill.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || sending || paused) return;
    input.value = '';
    options.onSend(text);
  });

  // Clicking the mouse focuses the input. If paused, clicking resumes.
  mouse.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (paused) {
      setPaused(false);
      options.onTogglePause(false);
      input.focus();
      return;
    }
    input.focus();
  });

  // Escape dismisses the speech bubble so the user can get back to reading
  // the page. Overlay has its own Escape handler for the dim backdrop.
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && bubble.style.display !== 'none') {
      hideBubble();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // Keep the home position correct across viewport resizes.
  function onResize(): void {
    if (atHome) {
      const home = computeHome();
      applyPosition(home.x, home.y);
    }
  }
  window.addEventListener('resize', onResize);

  // Initial position — bottom-right corner. Kick off the idle wiggle
  // so the cursor has personality from first paint.
  const initial = computeHome();
  applyPosition(initial.x, initial.y);
  scheduleIdleWiggle();

  return {
    element: root,
    focusInput: () => input.focus(),
    setPaused,
    setSending,
    addUserMessage,
    startAssistantTurn,
    moveTo,
    returnHome,
    destroy(): void {
      clearIdleWiggle();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      root.remove();
    },
  };
}

/**
 * Inline mouse SVG — moved over from `mouse-button.ts`. Kept as a literal
 * string so tsup inlines it into the bundle with no asset loader. Uses
 * `currentColor` so theming flows through the parent button.
 */
const MOUSE_SVG = /* html */ `
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M14 30c0-10 8-18 18-18s18 8 18 18v12a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8V30Z"
    stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
  <path d="M18 22c-3-2-6-4-9-4 1 5 4 8 8 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M46 22c3-2 6-4 9-4-1 5-4 8-8 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="25" cy="32" r="2" fill="currentColor"/>
  <circle cx="39" cy="32" r="2" fill="currentColor"/>
  <path d="M28 40c1 2 3 3 4 3s3-1 4-3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
</svg>
`;
