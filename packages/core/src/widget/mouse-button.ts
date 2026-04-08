/**
 * The floating mouse button — the persistent entry point to pip.
 *
 * Deliberately simple in the scaffold: a button with an inline SVG mouse
 * icon. Clicking it fires a callback. The chat panel, consent dialog, and
 * pause toggle arrive in the "Implement widget UI components" task and
 * will extend this file.
 */
export interface MouseButtonOptions {
  onClick: () => void;
}

export function createMouseButton({ onClick }: MouseButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'pip-button';
  button.type = 'button';
  button.setAttribute('aria-label', 'Open pip help assistant');
  button.innerHTML = MOUSE_SVG;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

/**
 * Small inline SVG mouse. Kept as a literal string so tsup inlines it into
 * the bundle without any asset-loader plumbing. Colors use `currentColor`
 * so the button inherits from the theme.
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
