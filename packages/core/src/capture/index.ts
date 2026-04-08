/**
 * Capture orchestration.
 *
 * Single entry point used by the transport layer: `capturePage(config)`
 * runs the three-stage pipeline and returns everything the server needs.
 *
 *   1. Find redaction targets and measure their viewport rects *before*
 *      taking the screenshot. Rects are in CSS pixels relative to the
 *      viewport, which is what the screenshot is scaled against.
 *   2. Take the screenshot via `html-to-image`.
 *   3. Apply rect-based redaction to the screenshot canvas in the browser.
 *      The unredacted bitmap never lives anywhere other than the canvas we
 *      overwrite.
 *   4. Build the textual DOM snapshot with the same redaction set, so the
 *      screenshot and the snapshot agree about what's sensitive.
 *
 * If any step fails, we throw — the transport layer catches it and surfaces
 * a clear error to the user rather than sending a broken/partial payload.
 */

import type { PipConfig } from '../types.js';
import { captureScreenshot } from './screenshot.js';
import {
  applyRectsToScreenshot,
  findRedactionTargets,
  measureRedactionRects,
} from './redact.js';
import { buildDomSnapshot } from './dom-snapshot.js';

export interface PageCaptureResult {
  screenshot: string;
  dom: string;
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
}

export async function capturePage(config: PipConfig): Promise<PageCaptureResult> {
  const redactedElements = new Set(findRedactionTargets(config.redact));
  const redactionRects = measureRedactionRects([...redactedElements]);

  const shot = await captureScreenshot();
  const redactedScreenshot = await applyRectsToScreenshot(
    shot.dataUrl,
    redactionRects,
    shot.devicePixelRatio,
  );

  const dom = buildDomSnapshot({
    redactedElements,
    redactedRects: redactionRects,
  });

  return {
    screenshot: redactedScreenshot,
    dom,
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: shot.devicePixelRatio,
    },
  };
}

export { captureScreenshot } from './screenshot.js';
export {
  findRedactionTargets,
  measureRedactionRects,
  applyRectsToScreenshot,
} from './redact.js';
export { buildDomSnapshot } from './dom-snapshot.js';
export type { RedactionRect } from './redact.js';
