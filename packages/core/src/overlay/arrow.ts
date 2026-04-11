/**
 * SVG overlay renderer for the `highlight` tool.
 *
 * Given a viewport-relative bounding box `{x, y, width, height}` and a
 * caption, this draws:
 *
 *   1. A full-viewport dimmed backdrop with a "cutout" around the target
 *      (via an SVG mask) so the target shines through while the rest of the
 *      page is dimmed.
 *   2. A stroked rectangle around the target with a pulsing accent color.
 *   3. A caption callout positioned above/below/left/right of the target —
 *      whichever side has room — with a small connecting triangle.
 *
 * The overlay element lives inside the pip Shadow DOM and is position:fixed
 * full-viewport, so its SVG coordinate system matches the viewport's CSS
 * pixel coordinates 1:1. That means we can pass the model's raw viewport
 * coordinates straight into SVG attributes with no transform.
 *
 * This file is pure rendering — the overlay host (freeze.ts) is responsible
 * for lifecycle, auto-dismissal, and plugging into the chat panel.
 */

export interface HighlightArgs {
  x: number;
  y: number;
  width: number;
  height: number;
  caption: string;
}

export interface RenderHighlightOptions {
  /**
   * Whether to render the caption bubble and its connector line. Defaults
   * to `true` for backwards compatibility. Callers that own their own
   * caption surface (e.g. the mouse widget's speech bubble) pass `false`
   * to get backdrop + ring only.
   */
  renderCaption?: boolean;
}

const CAPTION_WIDTH = 240;
const CAPTION_PADDING = 10;
const GAP = 12; // gap between target rect and caption

type CaptionSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * Render a highlight into an existing container element. The container
 * should be position:fixed full-viewport; this function replaces its
 * contents.
 */
export function renderHighlight(
  container: HTMLElement,
  args: HighlightArgs,
  options: RenderHighlightOptions = {},
): void {
  const renderCaption = options.renderCaption ?? true;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Clamp the target rect to the viewport so we never draw off-screen.
  const tx = clamp(args.x, 0, vw);
  const ty = clamp(args.y, 0, vh);
  const tw = Math.max(8, Math.min(args.width, vw - tx));
  const th = Math.max(8, Math.min(args.height, vh - ty));

  // Decide which side of the target has the most room for the caption.
  // Computed eagerly either way — it's cheap — but only read when we
  // actually render the caption.
  const side = pickCaptionSide({ x: tx, y: ty, width: tw, height: th, vw, vh });
  const captionPos = layoutCaption({ x: tx, y: ty, width: tw, height: th, vw, vh, side });

  container.innerHTML = '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'pip-overlay-svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  svg.setAttribute('width', String(vw));
  svg.setAttribute('height', String(vh));

  // Defs: mask that subtracts the target rect from the backdrop so the
  // highlighted element stays visible at full brightness.
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <mask id="pip-highlight-mask" maskUnits="userSpaceOnUse">
      <rect x="0" y="0" width="${vw}" height="${vh}" fill="white" />
      <rect x="${tx - 4}" y="${ty - 4}" width="${tw + 8}" height="${th + 8}" rx="6" fill="black" />
    </mask>
  `;
  svg.appendChild(defs);

  // Dimmed backdrop with the mask applied.
  const backdrop = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  backdrop.setAttribute('x', '0');
  backdrop.setAttribute('y', '0');
  backdrop.setAttribute('width', String(vw));
  backdrop.setAttribute('height', String(vh));
  backdrop.setAttribute('fill', 'rgba(0, 0, 0, 0.55)');
  backdrop.setAttribute('mask', 'url(#pip-highlight-mask)');
  svg.appendChild(backdrop);

  // Stroked rectangle around the target.
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  ring.setAttribute('x', String(tx - 4));
  ring.setAttribute('y', String(ty - 4));
  ring.setAttribute('width', String(tw + 8));
  ring.setAttribute('height', String(th + 8));
  ring.setAttribute('rx', '6');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', '#818cf8');
  ring.setAttribute('stroke-width', '3');
  ring.setAttribute('class', 'pip-overlay-ring');
  svg.appendChild(ring);

  if (renderCaption) {
    // Connector line from the caption anchor to the target edge.
    const connector = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    connector.setAttribute('x1', String(captionPos.connectorFrom.x));
    connector.setAttribute('y1', String(captionPos.connectorFrom.y));
    connector.setAttribute('x2', String(captionPos.connectorTo.x));
    connector.setAttribute('y2', String(captionPos.connectorTo.y));
    connector.setAttribute('stroke', '#818cf8');
    connector.setAttribute('stroke-width', '2');
    connector.setAttribute('stroke-linecap', 'round');
    svg.appendChild(connector);
  }

  container.appendChild(svg);

  if (renderCaption) {
    // Caption lives as an HTML element (not inside the SVG) so text
    // wrapping, font loading, and accessibility work as expected.
    const caption = document.createElement('div');
    caption.className = 'pip-overlay-caption';
    caption.setAttribute('role', 'status');
    caption.style.left = `${captionPos.x}px`;
    caption.style.top = `${captionPos.y}px`;
    caption.style.width = `${CAPTION_WIDTH}px`;
    caption.textContent = args.caption;
    container.appendChild(caption);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface CaptionLayoutInput {
  x: number;
  y: number;
  width: number;
  height: number;
  vw: number;
  vh: number;
  side: CaptionSide;
}

interface CaptionLayout {
  x: number;
  y: number;
  connectorFrom: { x: number; y: number };
  connectorTo: { x: number; y: number };
}

function pickCaptionSide(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  vw: number;
  vh: number;
}): CaptionSide {
  const aboveRoom = input.y;
  const belowRoom = input.vh - (input.y + input.height);
  const leftRoom = input.x;
  const rightRoom = input.vw - (input.x + input.width);

  // Prefer above/below because caption text wraps naturally horizontally.
  const minVertical = 80;
  if (belowRoom >= minVertical) return 'bottom';
  if (aboveRoom >= minVertical) return 'top';
  if (rightRoom >= CAPTION_WIDTH + GAP) return 'right';
  if (leftRoom >= CAPTION_WIDTH + GAP) return 'left';
  // Give up — pick the side with the most room.
  const roomEntries: Array<[CaptionSide, number]> = [
    ['bottom', belowRoom],
    ['top', aboveRoom],
    ['right', rightRoom],
    ['left', leftRoom],
  ];
  roomEntries.sort((a, b) => b[1] - a[1]);
  return roomEntries[0]![0];
}

function layoutCaption(input: CaptionLayoutInput): CaptionLayout {
  const { x, y, width, height, vw, vh, side } = input;
  const cx = x + width / 2;
  const cy = y + height / 2;

  switch (side) {
    case 'bottom': {
      const captionX = clamp(cx - CAPTION_WIDTH / 2, CAPTION_PADDING, vw - CAPTION_WIDTH - CAPTION_PADDING);
      const captionY = y + height + GAP;
      return {
        x: captionX,
        y: captionY,
        connectorFrom: { x: cx, y: y + height + 2 },
        connectorTo: { x: cx, y: captionY - 2 },
      };
    }
    case 'top': {
      const captionX = clamp(cx - CAPTION_WIDTH / 2, CAPTION_PADDING, vw - CAPTION_WIDTH - CAPTION_PADDING);
      const captionY = y - GAP - 60; // approximate caption height
      return {
        x: captionX,
        y: captionY,
        connectorFrom: { x: cx, y: y - 2 },
        connectorTo: { x: cx, y: captionY + 56 },
      };
    }
    case 'right': {
      const captionX = x + width + GAP;
      const captionY = clamp(cy - 30, CAPTION_PADDING, vh - 60 - CAPTION_PADDING);
      return {
        x: captionX,
        y: captionY,
        connectorFrom: { x: x + width + 2, y: cy },
        connectorTo: { x: captionX - 2, y: captionY + 30 },
      };
    }
    case 'left': {
      const captionX = x - GAP - CAPTION_WIDTH;
      const captionY = clamp(cy - 30, CAPTION_PADDING, vh - 60 - CAPTION_PADDING);
      return {
        x: captionX,
        y: captionY,
        connectorFrom: { x: x - 2, y: cy },
        connectorTo: { x: captionX + CAPTION_WIDTH + 2, y: captionY + 30 },
      };
    }
  }
}
