# Security policy

Thanks for helping keep pip and its users safe.

## Reporting a vulnerability

**Please do not file public GitHub issues for security vulnerabilities.** If you've found a bug that affects the confidentiality, integrity, or availability of pip's users (particularly anything that could cause the widget to send unredacted page content, leak credentials from the AI Gateway, or run arbitrary code inside the host page), report it privately.

File a GitHub private vulnerability report via the repository's **Security → Report a vulnerability** tab. That's the fastest path. If that's not available or you're not comfortable with GitHub's flow, email the maintainer (contact is in the repo owner's GitHub profile).

Please include:

1. A description of the issue and why it's a security concern
2. The steps to reproduce, ideally with a minimal example
3. The version of pip (branch/commit SHA is fine if unreleased)
4. Whether you've already shared the details with anyone else

## What I consider in-scope

- **Client-side redaction bypass.** The fail-closed invariant in `@pip-help/core/src/capture/redact.ts` — if redaction cannot complete, the widget must throw `RedactionError` instead of sending the unredacted source screenshot. Any path that bypasses this is a real security bug and will be fixed urgently.
- **Host-site XSS via pip.** Any way for streamed LLM output, caption text, or other model-controlled content to execute code inside the host page. The widget uses `textContent` exclusively for user- and model-controlled strings; deviations are bugs.
- **Shadow DOM escape.** The Shadow DOM is `mode: 'closed'` specifically so host-page scripts cannot read pip's chat transcript. Any regression that opens the shadow root to the host page is in-scope.
- **API key / token leakage.** The server adapter defaults to AI SDK's error masking. Any path that surfaces raw provider error text to the client without the dev explicitly opting in via `onError` is in-scope.
- **Unintentional persistence.** Chat history is documented as ephemeral. Any path that writes it to `localStorage`, `sessionStorage`, `IndexedDB`, or the network without a consent opt-in is a bug.

## What I consider out-of-scope

- **Vulnerabilities in third-party dependencies** (`html-to-image`, the Vercel AI SDK, Next.js, etc.). Please report those upstream — I'll pick up their fixes in our lockfile.
- **DoS via oversized `pip.md`** — the server has a 50,000-character soft cap with a warning, documented in `markdownFileContext`. Dev is responsible for sizing their own context.
- **LLM prompt injection from the user's chat input.** This is an AI safety concern, not a traditional security bug. Pip prompts the model to stay grounded in site context but does not defend against adversarial users trying to jailbreak the assistant. Dev can tighten this with `systemPromptExtra`.
- **Clickjacking attempts on the host page.** Pip renders in a Shadow DOM with `pointer-events: none` on its root container; children opt in. It does not defend against the host page being embedded in a malicious iframe — that's the host site's responsibility.

## Response expectations

pip is a small project with one maintainer, not a staffed security team. Realistic expectations:

- Acknowledgment: within 7 days
- Initial triage / severity assessment: within 14 days
- Fix for critical issues: aimed within 30 days, faster for anything actively exploitable

I'll credit you in the CHANGELOG and commit message unless you prefer to stay anonymous — please let me know in the report.

## Coordinated disclosure

If you've already notified a downstream user or publicly posted about the issue, tell me up-front so I can prioritize accordingly. I prefer to fix and release before public disclosure, but I understand if you have your own disclosure timeline and will work with it.
