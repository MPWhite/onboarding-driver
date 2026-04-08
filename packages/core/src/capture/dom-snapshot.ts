/**
 * Build a trimmed textual snapshot of interactive elements on the current
 * page.
 *
 * The LLM gets both this snapshot AND the screenshot. The snapshot is the
 * semantic channel — it tells the model "there's a button labeled
 * 'Create Project' at (x, y, w, h)" without requiring OCR. The screenshot is
 * the visual channel. Together they reduce grounding errors and let the
 * model pick coordinates for the `highlight` tool confidently.
 *
 * Redaction happens here too: matching elements are still included in the
 * snapshot (we don't want to lie to the model about what's on screen), but
 * their text content is replaced with `[redacted]`.
 */

import type { RedactionRect } from './redact.js';

/** Tags that are usually interactive enough to include in the snapshot. */
const INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'label',
]);

/** ARIA roles that indicate interactivity. */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'option',
  'slider',
  'spinbutton',
  'textbox',
  'combobox',
  'searchbox',
]);

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const MAX_ELEMENTS = 120;
const MAX_TEXT_LEN = 120;

export interface DomSnapshotOptions {
  redactedElements: Set<HTMLElement>;
  redactedRects: RedactionRect[];
}

/**
 * Walk the document, pick the interactive and heading elements that are
 * visible in the viewport, and render a compact textual description.
 *
 * Format (each line):
 *   [tag] "label" @ (x, y, w, h)
 *
 * e.g.
 *   [button] "Create project" @ (340, 120, 96, 32)
 *   [a] "Settings" @ (40, 40, 70, 20)
 *   [input:email] "(empty)" @ (220, 300, 260, 36)
 *   [h2] "Your projects" @ (40, 100, 200, 28)
 */
export function buildDomSnapshot(options: DomSnapshotOptions): string {
  const { redactedElements } = options;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const lines: string[] = [];
  const all = document.querySelectorAll<HTMLElement>('*');

  for (const el of all) {
    if (lines.length >= MAX_ELEMENTS) break;
    if (!isInteresting(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= vw || rect.top >= vh) continue;

    const tag = describeTag(el);
    const label = redactedElements.has(el) ? '[redacted]' : describeLabel(el);
    if (!label) continue;

    lines.push(
      `[${tag}] "${truncate(label, MAX_TEXT_LEN)}" @ (${Math.round(rect.left)}, ${Math.round(rect.top)}, ${Math.round(rect.width)}, ${Math.round(rect.height)})`,
    );
  }

  if (lines.length === 0) {
    return '(no interactive elements detected in the current viewport)';
  }

  return lines.join('\n');
}

function isInteresting(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) return true;
  if (HEADING_TAGS.has(tag)) return true;
  const role = el.getAttribute('role');
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  // Keep anything with an explicit test id or aria-label, even if not
  // interactive, because devs use those as semantic anchors.
  if (el.hasAttribute('aria-label') || el.hasAttribute('data-testid')) return true;
  return false;
}

function describeTag(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type || 'text';
    return `input:${type}`;
  }
  const role = el.getAttribute('role');
  if (role) return `${tag}[role=${role}]`;
  return tag;
}

function describeLabel(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  const tag = el.tagName.toLowerCase();

  if (tag === 'input') {
    const input = el as HTMLInputElement;
    const placeholder = input.placeholder?.trim();
    const value = input.type === 'password' ? '' : input.value?.trim();
    if (value) return value;
    if (placeholder) return `(placeholder: ${placeholder})`;
    return `(empty ${input.type || 'text'} input)`;
  }

  const text = collectText(el);
  if (text) return text;

  const title = el.getAttribute('title');
  if (title) return title.trim();

  return '';
}

/**
 * Collect the visible text content of an element, collapsing whitespace
 * and excluding descendant interactive elements we'll render separately.
 */
function collectText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
