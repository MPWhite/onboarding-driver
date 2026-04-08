# @pip-help/core

The pip widget — a vanilla TypeScript chat assistant that mounts into any website via a `<script>` tag or an `import`. Shadow DOM isolated, framework-free, ~14 KB gzipped.

This package is one half of [pip](https://github.com/MPWhite/onboarding-driver). You also need [`@pip-help/server`](https://www.npmjs.com/package/@pip-help/server) (or an equivalent) running behind a `/api/pip` route on your own backend.

## Install

### Script tag

```html
<script
  src="https://unpkg.com/@pip-help/core/dist/iife.js"
  data-pip-endpoint="/api/pip"
></script>
```

Recognized `data-pip-*` attributes:

- `data-pip-endpoint` *(required)* — the URL of your backend route.
- `data-pip-redact` — comma-separated CSS selectors to fully redact before sending.
- `data-pip-debug` — any value enables debug logging to the console.

### NPM, auto-mount

```ts
import '@pip-help/core/auto';
```

The auto entry mounts itself on `DOMContentLoaded`. Config is read (in order) from:

1. `window.__PIP_CONFIG__`
2. A `<script data-pip-endpoint="...">` tag
3. A `<meta name="pip-endpoint" content="...">` tag

### NPM, explicit mount

```ts
import { mount } from '@pip-help/core';

mount({
  endpoint: '/api/pip',
  redact: ['.customer-email'],
  debug: process.env.NODE_ENV === 'development',
});
```

Calling `mount()` twice is a no-op — the second call returns the existing instance, so React Strict Mode's dev double-invocation is safe.

## Config

```ts
interface PipConfig {
  /** URL of your pip backend route. Required. */
  endpoint: string;

  /** CSS selectors to redact. `input[type="password"]`, credit-card inputs,
   *  and `[data-pip="redact"]` are always redacted regardless of this list. */
  redact?: string[];

  /** Log outgoing payloads to console instead of sending. */
  debug?: boolean;

  /** Final chance to transform/scrub the payload before it leaves the browser. */
  beforeSend?: (payload: PipOutgoingPayload) => PipOutgoingPayload | Promise<PipOutgoingPayload>;

  /** Where to attach the widget host element. Defaults to `document.body`. */
  mountTarget?: HTMLElement;
}
```

See [`docs/api/client-config.md`](https://github.com/MPWhite/onboarding-driver/blob/main/docs/api/client-config.md) for the full reference.

## Privacy

Everything that redacts runs *in the user's browser, before the fetch*:

- **Always redacted (no config required):** `input[type="password"]`, `input[autocomplete*="cc-"]`, `[data-pip="redact"]`
- **Dev-configurable:** any CSS selectors you add via `redact: [...]`
- **Fully custom:** `beforeSend(payload)` lets you transform the entire payload
- **Consent:** first-use dialog stored in `localStorage` — users must explicitly opt in
- **Kill switch:** persistent "pause" toggle in the widget header; declining consent starts the widget in paused state

The widget renders in a **closed Shadow DOM**, so host-page scripts can't traverse `el.shadowRoot` to scrape the transcript.

## Instance API

`mount()` returns a `PipInstance`:

```ts
const pip = mount({ endpoint: '/api/pip' });

pip.open();               // open the chat panel
pip.close();              // close the chat panel
pip.setPaused(true);      // kill switch on (persists in localStorage)
pip.setPaused(false);     // resume
pip.isPaused();           // boolean
pip.destroy();            // remove from the DOM, abort in-flight requests
pip.config;               // the resolved, frozen config
```

## License

MIT — see the [repo LICENSE](https://github.com/MPWhite/onboarding-driver/blob/main/LICENSE).
