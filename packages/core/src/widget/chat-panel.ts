/**
 * Chat panel — the scrollable conversation + input + header controls.
 *
 * This file owns:
 *   - Rendering user and assistant message bubbles
 *   - The input textarea + send button (with Enter-to-send, Shift-Enter for
 *     newline)
 *   - The header: title, pause toggle, close button
 *   - A thin imperative API the transport layer uses to stream assistant
 *     text into the latest bubble
 *
 * No fetch logic lives here. The panel fires a `onSend` callback when the
 * user hits enter, and exposes `startAssistantTurn()`/`appendAssistantText()`
 * so the transport can drive the UI as stream chunks arrive.
 */

export interface ChatPanelHandle {
  element: HTMLElement;
  show(): void;
  hide(): void;
  isVisible(): boolean;
  focusInput(): void;
  setPaused(paused: boolean): void;
  setSending(sending: boolean): void;
  addUserMessage(text: string): void;
  startAssistantTurn(): AssistantTurnHandle;
}

/**
 * Streaming handle returned by `startAssistantTurn()`. The transport layer
 * writes deltas into it as stream chunks arrive.
 */
export interface AssistantTurnHandle {
  /** Append a text delta to the active assistant bubble. */
  appendText(delta: string): void;
  /** Mark the turn complete. Locks further writes. */
  finish(): void;
  /** Mark the turn as errored; renders a subtle error note. */
  error(message: string): void;
}

export interface ChatPanelOptions {
  onSend: (text: string) => void;
  onClose: () => void;
  onTogglePause: (paused: boolean) => void;
}

export function createChatPanel(options: ChatPanelOptions): ChatPanelHandle {
  const panel = document.createElement('div');
  panel.className = 'pip-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'pip help assistant');
  panel.style.display = 'none';

  panel.innerHTML = /* html */ `
    <header class="pip-panel-header">
      <div class="pip-panel-title">
        <span class="pip-panel-title-dot"></span>
        pip
      </div>
      <div class="pip-panel-header-actions">
        <button type="button" class="pip-panel-iconbtn" data-action="pause" aria-pressed="false" title="Pause pip">
          ${PAUSE_SVG}
        </button>
        <button type="button" class="pip-panel-iconbtn" data-action="close" aria-label="Close pip" title="Close">
          ${CLOSE_SVG}
        </button>
      </div>
    </header>
    <div class="pip-messages" data-pip-messages>
      <div class="pip-empty-state">
        Ask me anything about this page.
      </div>
    </div>
    <form class="pip-input-form" data-pip-form>
      <textarea
        class="pip-input"
        placeholder="Ask a question..."
        rows="1"
        aria-label="Ask a question"
      ></textarea>
      <button type="submit" class="pip-send" aria-label="Send">
        ${SEND_SVG}
      </button>
    </form>
  `;

  const messagesEl = panel.querySelector<HTMLDivElement>('[data-pip-messages]')!;
  const form = panel.querySelector<HTMLFormElement>('[data-pip-form]')!;
  const textarea = form.querySelector<HTMLTextAreaElement>('textarea')!;
  const sendBtn = form.querySelector<HTMLButtonElement>('.pip-send')!;
  const pauseBtn = panel.querySelector<HTMLButtonElement>('[data-action="pause"]')!;
  const closeBtn = panel.querySelector<HTMLButtonElement>('[data-action="close"]')!;

  let paused = false;
  let sending = false;

  function removeEmptyState(): void {
    const empty = messagesEl.querySelector('.pip-empty-state');
    if (empty) empty.remove();
  }

  function scrollToBottom(): void {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function autoResize(): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }

  textarea.addEventListener('input', autoResize);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    if (!text || sending || paused) return;
    textarea.value = '';
    autoResize();
    options.onSend(text);
  });

  closeBtn.addEventListener('click', () => {
    options.onClose();
  });

  pauseBtn.addEventListener('click', () => {
    setPaused(!paused);
    options.onTogglePause(paused);
  });

  function setPaused(next: boolean): void {
    paused = next;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.classList.toggle('pip-panel-iconbtn-active', paused);
    pauseBtn.title = paused ? 'Resume pip' : 'Pause pip';
    textarea.disabled = paused;
    sendBtn.disabled = paused || sending;
    if (paused) {
      addSystemNote('pip is paused. No page state will be shared until you resume.');
    }
  }

  function setSending(next: boolean): void {
    sending = next;
    sendBtn.disabled = sending || paused;
    textarea.disabled = sending;
    sendBtn.classList.toggle('pip-send-loading', sending);
  }

  function addUserMessage(text: string): void {
    removeEmptyState();
    const bubble = document.createElement('div');
    bubble.className = 'pip-msg pip-msg-user';
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    scrollToBottom();
  }

  function addSystemNote(text: string): void {
    const note = document.createElement('div');
    note.className = 'pip-msg-system';
    note.textContent = text;
    messagesEl.appendChild(note);
    scrollToBottom();
  }

  function startAssistantTurn(): AssistantTurnHandle {
    removeEmptyState();
    const bubble = document.createElement('div');
    bubble.className = 'pip-msg pip-msg-assistant pip-msg-streaming';
    const body = document.createElement('div');
    body.className = 'pip-msg-body';
    bubble.appendChild(body);
    messagesEl.appendChild(bubble);
    scrollToBottom();

    let closed = false;

    return {
      appendText(delta: string) {
        if (closed) return;
        body.textContent = (body.textContent ?? '') + delta;
        scrollToBottom();
      },
      finish() {
        if (closed) return;
        closed = true;
        bubble.classList.remove('pip-msg-streaming');
        if (!body.textContent) {
          body.textContent = '(no response)';
          body.classList.add('pip-msg-empty');
        }
      },
      error(message: string) {
        if (closed) return;
        closed = true;
        bubble.classList.remove('pip-msg-streaming');
        bubble.classList.add('pip-msg-error');
        body.textContent = message;
      },
    };
  }

  return {
    element: panel,
    show() {
      panel.style.display = 'flex';
      textarea.focus();
    },
    hide() {
      panel.style.display = 'none';
    },
    isVisible() {
      return panel.style.display !== 'none';
    },
    focusInput() {
      textarea.focus();
    },
    setPaused,
    setSending,
    addUserMessage,
    startAssistantTurn,
  };
}

const PAUSE_SVG = /* html */ `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="6" y="5" width="4" height="14" rx="1"/>
  <rect x="14" y="5" width="4" height="14" rx="1"/>
</svg>
`;

const CLOSE_SVG = /* html */ `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
</svg>
`;

const SEND_SVG = /* html */ `
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="m3 11 18-8-8 18-2-8-8-2Z"/>
</svg>
`;
