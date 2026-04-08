/**
 * Viewport screenshot.
 *
 * Uses `html-to-image` to rasterize the visible viewport via SVG foreign
 * objects → canvas → PNG data URL. Runs entirely in the browser — there is
 * no native screen capture API involved, so no permission prompt and no
 * access to content outside the current tab.
 *
 * Known limitations (documented in the README):
 *   - Cross-origin `<img>` tags without CORS headers won't render (browser
 *     refuses to draw them to canvas).
 *   - `<video>`, `<iframe>`, and complex canvas elements may come out blank.
 *   - Very tall pages aren't captured beyond the visible viewport — that's
 *     intentional (we're asking "what does the user currently see?", not
 *     "what's on the whole page").
 *
 * We exclude the pip widget itself from the screenshot via the `filter`
 * option, so the model never sees the mouse button or chat panel and tries
 * to point at them.
 */

import { toPng } from 'html-to-image';

export interface ScreenshotOptions {
  /**
   * Upper bound on the long edge of the output image in CSS pixels. Large
   * screenshots blow up prompt token budgets and slow everything down;
   * 1600px is plenty for coordinate grounding on a typical laptop.
   */
  maxDimension?: number;
}

export interface ScreenshotResult {
  /** PNG data URL. */
  dataUrl: string;
  /** Pixel dimensions of the encoded image. */
  width: number;
  height: number;
  /** Device pixel ratio used during capture. */
  devicePixelRatio: number;
}

export async function captureScreenshot(
  options: ScreenshotOptions = {},
): Promise<ScreenshotResult> {
  const maxDimension = options.maxDimension ?? 1600;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rawDpr = window.devicePixelRatio || 1;

  // Down-scale to fit within maxDimension. We prefer shrinking DPR over
  // shrinking logical pixels so the model still sees the full viewport
  // layout, just at lower fidelity.
  const longEdge = Math.max(vw, vh) * rawDpr;
  const scale = longEdge > maxDimension ? maxDimension / longEdge : rawDpr;

  const dataUrl = await toPng(document.documentElement, {
    pixelRatio: scale,
    // Only render what's in the current viewport — not the full scroll
    // extent. The model needs to point at what the user sees right now.
    width: vw,
    height: vh,
    style: {
      transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
      transformOrigin: 'top left',
      width: `${document.documentElement.scrollWidth}px`,
      height: `${document.documentElement.scrollHeight}px`,
    },
    // Skip the pip widget host element itself so the model never sees
    // our own UI in the screenshot.
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      if (node.hasAttribute('data-pip-host')) return false;
      return true;
    },
    // Use cacheBust so repeated captures don't pull stale images.
    cacheBust: true,
  });

  return {
    dataUrl,
    width: Math.round(vw * scale),
    height: Math.round(vh * scale),
    devicePixelRatio: scale,
  };
}
