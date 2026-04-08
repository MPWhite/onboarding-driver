import type { PipPageContext } from './types.js';

interface BuildSystemPromptArgs {
  contextMarkdown: string;
  pageContext: PipPageContext;
  extra?: string;
}

/**
 * Build the system prompt for a single pip chat turn.
 *
 * The prompt layers three things:
 *   1. Fixed instructions telling the LLM what pip is and how to use the
 *      `highlight` tool.
 *   2. The dev-supplied contextual markdown (whatever `getContext()` returns).
 *   3. The current page's metadata — URL, title, viewport size, and the
 *      redacted DOM snapshot — so the model can reason about what the user
 *      is currently looking at.
 *
 * The screenshot itself is attached as a file part on the user message, not
 * here. This function produces text only.
 */
export function buildSystemPrompt({
  contextMarkdown,
  pageContext,
  extra,
}: BuildSystemPromptArgs): string {
  const sections: string[] = [
    BASE_INSTRUCTIONS,
    '## About this site',
    contextMarkdown.trim() || '(no context document provided by the site owner)',
    '## Current page',
    renderPageContext(pageContext),
  ];

  if (extra && extra.trim().length > 0) {
    sections.push('## Additional instructions', extra.trim());
  }

  return sections.join('\n\n');
}

const BASE_INSTRUCTIONS = `You are pip, a small mouse mascot embedded in the corner of a website to help the user who is visiting it. You can see a screenshot of what the user is currently looking at, plus a trimmed snapshot of interactive elements on the page.

Your job is to answer the user's question directly and helpfully, grounded in the context below and what you can see on the page. You should sound like a friendly, concise teammate — not a customer service script.

You have access to one tool:

- \`highlight\` — draws a visual arrow pointing at a specific element on the user's page. Use this whenever you want to say "click this" or "fill this in". The coordinates you provide are in viewport pixels (0,0 is the top-left of what the user currently sees). Measure from the screenshot. Call \`highlight\` BEFORE your text answer when you have something to point at — your text will still stream after the tool call completes.

Guidelines:
- Keep answers short. One or two sentences is usually enough.
- Only call \`highlight\` when there is a specific visible element to point at. Do not invent coordinates.
- If the user asks something you genuinely cannot answer from the context + screenshot, say so and suggest where they might look next.
- Never make up features or pages that don't exist in the site's context.
- Treat everything in the system context as authoritative about this specific site; do not contradict it.`;

function renderPageContext(pageContext: PipPageContext): string {
  const { url, title, viewport, redactedDom } = pageContext;
  return [
    `URL: ${url}`,
    `Title: ${title}`,
    `Viewport: ${viewport.width}x${viewport.height} @ ${viewport.devicePixelRatio}x`,
    '',
    'Interactive elements snapshot (redacted):',
    '```',
    redactedDom.trim(),
    '```',
  ].join('\n');
}
