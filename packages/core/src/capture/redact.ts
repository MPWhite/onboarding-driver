/**
 * Client-side redaction.
 *
 * Everything in this file runs in the user's browser BEFORE a single byte
 * leaves for the dev's backend. That ordering is the whole privacy story —
 * the dev's server never sees the unredacted screenshot or DOM.
 *
 * Three layers of redaction:
 *
 *   1. Always-on selectors: `input[type="password"]`,
 *      `input[autocomplete*="cc-"]`, `[data-pip="redact"]`. Non-negotiable.
 *   2. Dev-supplied selectors from `config.redact`.
 *   3. A user-supplied `config.beforeSend` hook that can mutate the final
 *      payload (the most flexible escape hatch). Applied by the transport
 *      layer after redaction, not here.
 */

const ALWAYS_REDACT_SELECTORS = [
  'input[type="password"]',
  'input[autocomplete*="cc-"]',
  '[data-pip="redact"]',
] as const;

/**
 * Collect every element on the page that should be redacted.
 * De-duplicates across selector sources so nothing gets double-counted.
 */
export function findRedactionTargets(devSelectors: string[] = []): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const selectors = [...ALWAYS_REDACT_SELECTORS, ...devSelectors];

  for (const selector of selectors) {
    let matches: NodeListOf<Element>;
    try {
      matches = document.querySelectorAll(selector);
    } catch {
      // Invalid selector from dev config — skip, don't crash capture.
      if (typeof console !== 'undefined') {
        console.warn(`[pip] invalid redact selector: ${selector}`);
      }
      continue;
    }
    matches.forEach((el) => {
      if (el instanceof HTMLElement) seen.add(el);
    });
  }

  return [...seen];
}

/**
 * The bounding rect of a redaction target, in CSS pixels relative to the
 * viewport. Returned separately from the element so callers don't have to
 * re-measure layout later (getBoundingClientRect is expensive and triggers
 * reflow).
 */
export interface RedactionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function measureRedactionRects(elements: HTMLElement[]): RedactionRect[] {
  const rects: RedactionRect[] = [];
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    // Ignore elements fully outside the viewport.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right < 0 || rect.bottom < 0 || rect.left > vw || rect.top > vh) {
      continue;
    }
    rects.push({
      x: Math.max(0, Math.floor(rect.left)),
      y: Math.max(0, Math.floor(rect.top)),
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    });
  }
  return rects;
}

/**
 * Draw opaque black boxes over redaction rects on an existing PNG data URL.
 *
 * We decode the screenshot into an HTMLImageElement, draw it onto a canvas,
 * fill over every rect with black, and re-encode. All of this stays in the
 * browser — the raw screenshot never escapes to any worker or network call.
 *
 * FAIL-CLOSED INVARIANT: if we have rects to redact and anything along the
 * canvas path fails (context creation, taint errors on toDataURL, image load),
 * we THROW rather than return the unredacted source. The transport layer
 * catches the throw and surfaces an error in the chat bubble. This matters
 * because the whole privacy story depends on the redacted screenshot being
 * the only one that leaves the browser — if we fall back to the original
 * on error, a single weird browser state leaks password fields.
 */
export class RedactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedactionError';
  }
}

export async function applyRectsToScreenshot(
  screenshot: string,
  rects: RedactionRect[],
  dpr: number,
): Promise<string> {
  // No rects → nothing sensitive to redact → the raw screenshot IS the
  // redacted screenshot. This is the only safe short-circuit.
  if (rects.length === 0) return screenshot;

  const img = await loadImage(screenshot);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new RedactionError(
      'pip: could not create a 2D canvas context to redact the screenshot. ' +
        'Refusing to send the unredacted original.',
    );
  }

  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = '#000000';
  for (const rect of rects) {
    ctx.fillRect(rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr);
  }

  try {
    return canvas.toDataURL('image/png');
  } catch (error) {
    throw new RedactionError(
      'pip: canvas was tainted and could not be re-encoded after redaction. ' +
        'Refusing to send the unredacted original. Original cause: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('pip: failed to load screenshot for redaction'));
    img.src = src;
  });
}
