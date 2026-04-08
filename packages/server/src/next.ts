/**
 * Next.js App Router entry for `@pip-help/server`.
 *
 * This is a thin re-export of `createPipHandler` — the handler already
 * returns a `Promise<Response>` from a `Request`, which is exactly the
 * signature App Router route handlers expect. The separate entry exists so
 * devs can write the more discoverable import:
 *
 *     import { createPipHandler } from '@pip-help/server/next';
 *
 * …and so we have a dedicated place to add Next.js-specific helpers in the
 * future (runtime hints, maxDuration exports, etc.) without bloating the
 * main entry.
 */
export { createPipHandler, markdownFileContext } from './index.js';
export type {
  PipHandlerConfig,
  PipPageContext,
  PipRequest,
  GetContextFn,
  GetContextInput,
  PipUIMessage,
} from './index.js';
