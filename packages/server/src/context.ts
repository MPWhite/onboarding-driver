import { readFile } from 'node:fs/promises';
import type { GetContextFn } from './types.js';

/**
 * Soft cap on the markdown content, in characters. Larger files get
 * truncated and a warning is logged. This is a safety net against someone
 * dropping a full design doc or a huge FAQ in pip.md and blowing the
 * prompt budget (which would fail the LLM call with an unhelpful error).
 *
 * Real RAG setups should use a custom `getContext` with top-k retrieval
 * anyway — this limit is just to keep the default happy-path sane.
 */
const DEFAULT_MAX_CHARS = 50_000;

export interface MarkdownFileContextOptions {
  /** Soft cap in characters. Defaults to 50,000. */
  maxChars?: number;
}

/**
 * Default `getContext` implementation — reads a static markdown file from
 * disk on every call. The file is not cached, so hot-edits during `pnpm dev`
 * show up on the next chat turn without a restart.
 *
 * For production, devs are expected to wrap this (or write their own) to
 * plug in vector search, an internal API call, or per-user personalization.
 *
 * @example
 *   export const POST = createPipHandler({
 *     model: 'anthropic/claude-sonnet-4.6',
 *     getContext: markdownFileContext('./pip.md'),
 *   });
 */
export function markdownFileContext(
  filePath: string,
  options: MarkdownFileContextOptions = {},
): GetContextFn {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  return async () => {
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return `(pip context file not found at ${filePath})`;
      }
      throw error;
    }

    if (content.length > maxChars) {
      console.warn(
        `[pip] ${filePath} is ${content.length} chars, exceeding the ${maxChars}-char limit. ` +
          `Truncating to the first ${maxChars} chars. ` +
          `For a file this large, write a custom getContext() that does top-k retrieval instead.`,
      );
      return content.slice(0, maxChars);
    }

    return content;
  };
}
