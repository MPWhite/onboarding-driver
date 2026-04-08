import { createPipHandler, markdownFileContext } from '@pip-help/server/next';
import path from 'node:path';

/**
 * The pip backend route.
 *
 * Reads the demo's `pip.md` from the app root on every call so hot edits
 * show up on the next chat turn without a restart. Uses the Vercel AI
 * Gateway via a simple `provider/model` string — on Vercel deployments
 * OIDC auth works out of the box; for local dev set
 * `AI_GATEWAY_API_KEY` in `.env.local`.
 */
export const POST = createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: markdownFileContext(path.join(process.cwd(), 'pip.md')),
});

/** Fluid Compute default is 300s; pip responses complete well under that. */
export const maxDuration = 60;
