/**
 * Contract between the transport layer and whichever widget owns the
 * assistant's live-streaming output. The transport only needs to know
 * how to push text deltas and terminate the turn — it doesn't care
 * whether the text renders into a chat bubble, a speech bubble hanging
 * off a moving mouse, or anywhere else.
 *
 * Kept in its own file (rather than next to a specific widget) so the
 * widget implementation can be swapped without dragging the transport
 * layer's type imports with it.
 */
export interface AssistantTurnHandle {
  /** Append a text delta to the active assistant output. */
  appendText(delta: string): void;
  /** Mark the turn complete. Further writes are ignored. */
  finish(): void;
  /** Mark the turn as errored; renders a subtle error note. */
  error(message: string): void;
}
