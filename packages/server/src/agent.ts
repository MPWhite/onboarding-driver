import { ToolLoopAgent, stepCountIs, type InferAgentUIMessage } from 'ai';
import { pipTools } from './tools.js';
import type { PipHandlerConfig } from './types.js';

interface BuildPipAgentArgs {
  model: PipHandlerConfig['model'];
  instructions: string;
  maxSteps?: number;
}

/**
 * Construct a fresh `ToolLoopAgent` for a single request.
 *
 * We rebuild the agent per request (rather than caching one at module init)
 * because the `instructions` string includes the dev-supplied contextual
 * markdown and the current page's metadata — both of which change with each
 * user turn. `ToolLoopAgent` is a thin configuration holder, so this is
 * cheap.
 */
export function buildPipAgent({
  model,
  instructions,
  maxSteps = 5,
}: BuildPipAgentArgs) {
  return new ToolLoopAgent({
    model: model as never,
    instructions,
    tools: pipTools,
    stopWhen: stepCountIs(maxSteps),
  });
}

export type PipAgent = ReturnType<typeof buildPipAgent>;

/**
 * The `UIMessage` type produced by the pip agent. Consumers (the client
 * widget, or devs who want end-to-end type safety) can import this to get
 * typed message parts, including the `tool-highlight` tool part.
 */
export type PipUIMessage = InferAgentUIMessage<PipAgent>;
