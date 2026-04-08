import { PIP_STYLES } from './styles.js';

/**
 * Create the isolated Shadow DOM container that every pip UI element lives
 * inside. We use a single host element attached to `document.body` (or a
 * dev-supplied mount target) and attach a closed shadow root so host-page
 * scripts can't inspect or mutate our internals.
 *
 * Returns:
 *   - `host` — the container attached to the document. Dev can remove this
 *     to tear pip down.
 *   - `shadow` — the shadow root, used as the parent for all widget nodes.
 *   - `root` — a `.pip-root` div inside the shadow that children attach to,
 *     giving us a single position-fixed layer we fully control.
 */
export interface PipShadowContainer {
  host: HTMLElement;
  shadow: ShadowRoot;
  root: HTMLDivElement;
}

export function createShadowContainer(mountTarget: HTMLElement): PipShadowContainer {
  const host = document.createElement('div');
  host.setAttribute('data-pip-host', '');
  host.style.position = 'relative';
  host.style.zIndex = '2147483000';

  // Closed mode so host-page scripts can't traverse `el.shadowRoot` and
  // scrape the chat transcript or redaction config. We still hold a
  // reference internally.
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = PIP_STYLES;
  shadow.appendChild(style);

  const root = document.createElement('div');
  root.className = 'pip-root';
  shadow.appendChild(root);

  mountTarget.appendChild(host);

  return { host, shadow, root };
}
