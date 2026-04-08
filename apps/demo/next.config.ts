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
 */
const config: NextConfig = {
  transpilePackages: ['@pip-help/core', '@pip-help/server'],
  turbopack: {
    root: path.join(import.meta.dirname, '../..'),
  },
};

export default config;
