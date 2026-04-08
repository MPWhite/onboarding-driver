import { readFile } from 'node:fs/promises';
import type { GetContextFn } from './types.js';

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
export function markdownFileContext(filePath: string): GetContextFn {
  return async () => {
    try {
      return await readFile(filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return `(pip context file not found at ${filePath})`;
      }
      throw error;
    }
  };
}
