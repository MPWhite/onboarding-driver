import type { NextConfig } from 'next';
import path from 'node:path';

/**
 * The demo app consumes two workspace packages as source. Next.js in a
 * monorepo normally tree-shakes via their built `dist/` output, but during
 * active development it's nice to let Next transpile them directly so edits
 * show up without running `pnpm --filter @pip-help/core build` each time.
 *
 * `turbopack.root` is pinned to the monorepo root so Next doesn't guess
 * wrong when there's a parent lockfile higher up the filesystem.
 *
 * `outputFileTracingIncludes` forces Next to bundle `pip.md` into the
 * `/api/pip` function output. Without this, `process.cwd()` at runtime
 * points at the function's working dir and the file tracer doesn't know
 * to include a markdown file it didn't discover through imports — the
 * route would read a non-existent path on Vercel and `markdownFileContext`
 * would return the "not found" placeholder.
 */
const config: NextConfig = {
  transpilePackages: ['@pip-help/core', '@pip-help/server'],
  turbopack: {
    root: path.join(import.meta.dirname, '../..'),
  },
  outputFileTracingIncludes: {
    '/api/pip': ['./pip.md'],
  },
};

export default config;
