# `@pip-help/core` — client config reference

The shape of the config object passed to `mount()`, and what each option does.

```ts
import { mount, type PipConfig } from '@pip-help/core';

const pip = mount({
  endpoint: '/api/pip',
  redact: ['.customer-email'],
  debug: false,
  beforeSend: (payload) => payload,
  mountTarget: document.body,
});
```

## `endpoint` *(required)*

**Type:** `string`

The URL of your pip backend route. Typically `/api/pip` for a same-origin Next.js or Express setup. Full URLs (cross-origin) work too if your backend allows CORS on the POST.

## `redact`

**Type:** `string[]`
**Default:** `[]`

CSS selectors to redact before the payload leaves the browser. Matching elements are:

- Blacked out with an opaque rectangle on the screenshot canvas
- Stripped of their text in the DOM snapshot (replaced with `[redacted]`)

Three things are **always redacted** regardless of this list — you cannot opt out:

- `input[type="password"]`
- `input[autocomplete*="cc-"]` (credit-card inputs)
- `[data-pip="redact"]`

Examples:

```ts
mount({
  endpoint: '/api/pip',
  redact: [
    '.customer-email',           // class
    '#sensitive-table',          // id
    '[data-role="ssn"]',         // attribute
    '.billing-info *',           // descendant combinator
  ],
});
```

Invalid selectors are logged to `console.warn` and skipped — they don't break capture.

## `debug`

**Type:** `boolean`
**Default:** `false`

When true, pip logs the full outgoing payload to the console **instead of sending it** over the network. Useful for auditing what pip sees before shipping to production.

```ts
mount({
  endpoint: '/api/pip',
  debug: process.env.NODE_ENV === 'development',
});
```

When debug mode is on, the chat UI still renders a "sending…" state and eventually errors out (because no response ever arrives) — it's a visual cue that you're in audit mode, not something to ship.

## `beforeSend`

**Type:** `(payload: PipOutgoingPayload) => PipOutgoingPayload | Promise<PipOutgoingPayload>`
**Default:** *(none — payload is sent as-is)*

A hook that runs after redaction and right before the fetch. Your last chance to transform the payload.

```ts
mount({
  endpoint: '/api/pip',
  beforeSend: async (payload) => {
    // Strip anything matching a custom regex from the DOM snapshot
    payload.pageContext.redactedDom = payload.pageContext.redactedDom.replace(
      /\b[A-Z]{2}\d{6}\b/g,
      '[redacted]',
    );
    return payload;
  },
});
```

Common use cases:

- Adding custom authentication headers (via a different path — `beforeSend` can't mutate the fetch options directly; use a proxy route on your backend instead)
- Stripping custom fields from the DOM snapshot
- Blurring additional regions of the screenshot
- Adding trace IDs to the payload for observability

## `mountTarget`

**Type:** `HTMLElement`
**Default:** `document.body`

Where to attach the Shadow DOM host element. Rarely needed — the default works for 99% of sites. Override if you're embedding pip in an iframe with a specific mount point, or in tests where `document.body` doesn't exist.

---

## The `PipInstance` return value

`mount()` returns a programmatic handle to the live widget:

```ts
interface PipInstance {
  /** Open the chat panel. If consent hasn't been granted yet, shows the
   *  consent dialog instead. */
  open(): void;

  /** Close the chat panel. Does not clear conversation history. */
  close(): void;

  /** Toggle the kill switch. setPaused(true) persists to localStorage as
   *  "pip-consent: denied", so it survives page reloads until the user
   *  explicitly resumes from the widget header. */
  setPaused(paused: boolean): void;

  /** Whether pip is currently paused. */
  isPaused(): boolean;

  /** Remove the widget from the DOM, abort any in-flight request, and
   *  clear conversation history. Safe to call multiple times. */
  destroy(): void;

  /** The resolved config this instance is using. Frozen — mutate at your
   *  own risk. */
  readonly config: Readonly<PipConfig>;
}
```

**Double-mount is a no-op.** Calling `mount()` twice returns the same instance. This makes React Strict Mode's dev double-invocation safe.

## The `PipOutgoingPayload` wire format

The shape of what goes on the wire, in case you want to build your own backend or transform the payload via `beforeSend`:

```ts
interface PipOutgoingPayload {
  uiMessages: PipUIMessageLike[];  // AI SDK v6 UIMessage[] format
  pageContext: {
    url: string;
    title: string;
    viewport: {
      width: number;
      height: number;
      devicePixelRatio: number;
    };
    redactedDom: string;            // Textual snapshot of interactive elements
  };
}
```

The screenshot itself is attached as a `file` part on the most recent user message in `uiMessages`, with `mediaType: 'image/png'` and a data URL. Not included in `pageContext` to keep that object a plain-JSON-safe shape.

## Privacy summary

**Everything that redacts happens client-side, before the fetch.** The dev's backend never receives sensitive data. In order:

1. Collect always-on + `config.redact` + `[data-pip="redact"]` elements
2. Measure bounding rects while layout is stable
3. Take the screenshot
4. Paint opaque black over each rect on the canvas
5. Walk the DOM for the snapshot, stripping text from the same element set
6. Build the `PipOutgoingPayload`
7. Run `config.beforeSend` if provided
8. If `config.debug`, log and return; otherwise fetch

The widget renders in a **closed Shadow DOM**, so host-page scripts can't traverse `el.shadowRoot` to scrape the transcript.
