# pip

> A tiny mouse that helps your users.

**pip** is an open-source drop-in help widget that any website can add in essentially one line of code. Users click a mouse icon in the corner, ask a question in natural language, and get a contextual answer grounded in your site's docs — with a visual arrow pointing at exactly where to click next.

## Status

Pre-alpha. Design phase. No code yet — the architecture is in [`docs/design/2026-04-07-v1-design.md`](docs/design/2026-04-07-v1-design.md).

## What it does (planned)

- **Drop-in install.** One `<script>` tag (or one `import`) and the mouse appears in the corner of your site.
- **Contextual help.** Each question ships a screenshot + a trimmed DOM snapshot + your own docs (a markdown file, by default) to an LLM. Answers are grounded in what the user is actually looking at.
- **Visual pointing.** The model can highlight the specific button or field the user should interact with next — a dimmed backdrop + an SVG arrow, on top of the page.
- **Self-hosted and open source.** You run the backend route; you control the LLM key; your user data never touches a third party you didn't choose.
- **Privacy-defensible.** Password fields auto-redacted, dev-configurable redaction selectors, first-use consent, persistent kill switch. Redaction happens client-side before the fetch.

## Architecture at a glance

- **`@pip-help/core`** — vanilla TypeScript widget. Shadow DOM isolated, framework-free, <35KB gzipped target. Ships as both an IIFE (for `<script>` tag users) and ESM (for `npm install`).
- **`@pip-help/server`** — thin backend adapter around the [Vercel AI SDK v6](https://sdk.vercel.ai). Uses the `ToolLoopAgent` pattern with Gateway model strings by default.
- **Default model:** `anthropic/claude-sonnet-4.6` via the Vercel AI Gateway. Swappable.

Full architecture, data flow, privacy design, and repo layout are in the [v1 design doc](docs/design/2026-04-07-v1-design.md).

## Design docs

Significant design decisions are versioned in [`docs/design/`](docs/design/) and reviewed via PR. See the [design docs index](docs/design/README.md) for the current list.

## License

[MIT](LICENSE) — see the license file for the full text.
