#!/usr/bin/env node
// Smoke test for the built dist artifacts of both publishable packages.
//
// The typecheck + tsup build pass upstream; this script catches the
// failure mode where the output LOADS but is somehow broken at runtime:
//   - Circular exports that only fail on evaluation, not on type-check
//   - Missing symbols in one module format (cjs) but not the other (esm)
//   - Bundler misconfiguration that drops side effects unexpectedly
//
// Run from the repo root: `node scripts/smoke-test-dist.mjs`
//
// Exits nonzero if any check fails. CI runs this after `turbo run build`.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function check(name, condition) {
  results.push({ name, ok: Boolean(condition) });
}

// ---- @pip-help/server ----
const server = await import(
  path.join(ROOT, 'packages/server/dist/index.js')
);

check('server: createPipHandler is a function', typeof server.createPipHandler === 'function');
check('server: markdownFileContext is a function', typeof server.markdownFileContext === 'function');
check('server: pipTools exposes highlight', typeof server.pipTools?.highlight === 'object');
check('server: highlightTool has a description', typeof server.highlightTool?.description === 'string');
check('server: buildSystemPrompt is a function', typeof server.buildSystemPrompt === 'function');
check('server: PipPageContextSchema has parse()', typeof server.PipPageContextSchema?.parse === 'function');
check('server: PipRequestSchema has parse()', typeof server.PipRequestSchema?.parse === 'function');

const handler = server.createPipHandler({
  model: 'anthropic/claude-sonnet-4.6',
  getContext: () => 'test context',
});
check('server: createPipHandler returns a function', typeof handler === 'function');

const badReq = new Request('http://test/api/pip', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ bad: 'payload' }),
});
const badResp = await handler(badReq);
check('server: handler returns 400 on bad payload', badResp.status === 400);

const ctxFn = server.markdownFileContext('/definitely-does-not-exist.md');
const ctxText = await ctxFn({
  query: 'test',
  url: 'http://test',
  pageContext: {
    url: 'http://test',
    title: 't',
    viewport: { width: 1, height: 1, devicePixelRatio: 1 },
    redactedDom: '',
  },
});
check(
  'server: markdownFileContext handles missing file gracefully',
  typeof ctxText === 'string' && ctxText.includes('not found'),
);

// Server /next entry — should re-export the same handler factory
const serverNext = await import(
  path.join(ROOT, 'packages/server/dist/next.js')
);
check('server/next: re-exports createPipHandler', typeof serverNext.createPipHandler === 'function');
check('server/next: re-exports markdownFileContext', typeof serverNext.markdownFileContext === 'function');

// ---- @pip-help/core ----
const core = await import(
  path.join(ROOT, 'packages/core/dist/index.js')
);
check('core: mount is a function', typeof core.mount === 'function');
check('core: getActiveInstance is a function', typeof core.getActiveInstance === 'function');
check('core: VERSION is a string', typeof core.VERSION === 'string');
check('core: PipConfigError is constructible', (() => {
  try {
    const err = new core.PipConfigError('test');
    return err instanceof Error && err.name === 'PipConfigError';
  } catch {
    return false;
  }
})());

// mount() should throw helpfully in Node (no document)
let mountErr;
try {
  core.mount({ endpoint: '/api/pip' });
} catch (e) {
  mountErr = e;
}
check(
  'core: mount() throws a browser-environment error in Node',
  mountErr && /browser/i.test(mountErr.message),
);

// Core auto entry — also importable, should not throw just by being imported
// in Node (the DOMContentLoaded path requires `document`, so the module
// should no-op safely in Node). Also verifies the auto entry re-exports
// the full public API so script-tag IIFE consumers get `pip.mount(...)`
// etc. on the window global as a manual escape hatch.
let autoImportErr;
let auto;
try {
  auto = await import(path.join(ROOT, 'packages/core/dist/auto.js'));
} catch (e) {
  autoImportErr = e;
}
check('core/auto: imports cleanly in Node (no document)', !autoImportErr);
check('core/auto: re-exports mount', typeof auto?.mount === 'function');
check('core/auto: re-exports getActiveInstance', typeof auto?.getActiveInstance === 'function');
check('core/auto: re-exports VERSION', typeof auto?.VERSION === 'string');
check('core/auto: re-exports PipConfigError', typeof auto?.PipConfigError === 'function');

// IIFE bundle sanity — should be valid JS and not crash when parsed.
const fs = await import('node:fs');
const iife = fs.readFileSync(
  path.join(ROOT, 'packages/core/dist/iife.js'),
  'utf-8',
);
check('core/iife: file exists and is non-empty', iife.length > 1000);
check('core/iife: no process.env references (browser leak)', !/process\.env/.test(iife));
check('core/iife: no node: imports (browser leak)', !/["']node:/.test(iife));
try {
  new Function(iife);
  check('core/iife: parses as valid JavaScript', true);
} catch (e) {
  check('core/iife: parses as valid JavaScript (FAILED: ' + e.message + ')', false);
}

// ---- CJS builds ----
// We ship both ESM (checked above) and CJS. CommonJS consumers hit a
// completely different entry file and a different evaluation model —
// circular exports that work in ESM can deadlock in CJS, and tsup's
// CJS output has occasionally lost symbols. Use createRequire from the
// ESM context to pull the CJS builds.
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const serverCjs = require(
  path.join(ROOT, 'packages/server/dist/index.cjs'),
);
check('server/cjs: createPipHandler is a function', typeof serverCjs.createPipHandler === 'function');
check('server/cjs: markdownFileContext is a function', typeof serverCjs.markdownFileContext === 'function');
check('server/cjs: buildSystemPrompt is a function', typeof serverCjs.buildSystemPrompt === 'function');
check('server/cjs: PipRequestSchema has parse()', typeof serverCjs.PipRequestSchema?.parse === 'function');

const serverNextCjs = require(
  path.join(ROOT, 'packages/server/dist/next.cjs'),
);
check('server/next.cjs: re-exports createPipHandler', typeof serverNextCjs.createPipHandler === 'function');

const coreCjs = require(path.join(ROOT, 'packages/core/dist/index.cjs'));
check('core/cjs: mount is a function', typeof coreCjs.mount === 'function');
check('core/cjs: VERSION is a string', typeof coreCjs.VERSION === 'string');
check('core/cjs: PipConfigError is a constructor', typeof coreCjs.PipConfigError === 'function');

// core/cjs mount() should also throw its browser guard in Node
let cjsMountErr;
try {
  coreCjs.mount({ endpoint: '/api/pip' });
} catch (e) {
  cjsMountErr = e;
}
check(
  'core/cjs: mount() throws browser-environment error in Node',
  cjsMountErr && /browser/i.test(cjsMountErr.message),
);

// ---- Report ----
let failures = 0;
for (const r of results) {
  console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name);
  if (!r.ok) failures++;
}
console.log();
console.log(`${results.length} checks, ${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures > 0 ? 1 : 0);
