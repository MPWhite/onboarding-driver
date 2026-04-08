import { defineConfig } from 'tsup';

/**
 * Two passes:
 *
 *   1. ESM + CJS + d.ts for `@pip-help/core` and `@pip-help/core/auto`.
 *      - `index` has no side effects; consumers call `mount()` explicitly.
 *      - `auto` is the side-effect entry that auto-mounts on load. NPM users
 *        write `import '@pip-help/core/auto'`.
 *
 *   2. A single IIFE bundle from the same auto entry point. Script-tag users
 *      load this via unpkg/jsdelivr and it self-runs. Minified and bundled
 *      all-in-one — no external imports — with a `pip` global exposed as an
 *      escape hatch for manual `pip.mount()` after auto-mount.
 */
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      auto: 'src/auto.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    splitting: false,
    treeshake: true,
    platform: 'browser',
  },
  {
    entry: { iife: 'src/auto.ts' },
    format: ['iife'],
    globalName: 'pip',
    outExtension: () => ({ js: '.js' }),
    clean: false,
    sourcemap: true,
    minify: true,
    target: 'es2022',
    platform: 'browser',
    // IIFE must be fully self-contained so it works from a <script> tag with
    // no imports. No external dependencies.
    noExternal: [/.*/],
  },
]);
