import { tool } from 'ai';
import { z } from 'zod';

/**
 * The `highlight` tool lets the LLM visually point at an element on the
 * user's page. It takes viewport-pixel coordinates and a short caption; the
 * client renders a dimmed backdrop and an SVG arrow.
 *
 * The tool has a trivial `execute` that returns `{ highlighted: true }` so
 * the agent loop continues after the call — this lets the model emit a
 * pointer AND follow it with a text explanation in the same response.
 * Without an `execute` the loop would stop after the tool call, and the
 * user would see an arrow with no surrounding explanation.
 */
export const highlightTool = tool({
  description:
    "Visually highlight an element on the user's current page to point at it. Use viewport-pixel coordinates read from the screenshot. Call this BEFORE your text explanation whenever there is a specific thing the user should click, fill in, or look at.",
  inputSchema: z.object({
    x: z
      .number()
      .int()
      .nonnegative()
      .describe(
        'X pixel coordinate of the TOP-LEFT corner of the element, relative to the current viewport (0,0 is top-left of what the user sees).',
      ),
    y: z
      .number()
      .int()
      .nonnegative()
      .describe(
        'Y pixel coordinate of the TOP-LEFT corner of the element, relative to the current viewport.',
      ),
    width: z
      .number()
      .int()
      .positive()
      .describe('Width of the element in pixels.'),
    height: z
      .number()
      .int()
      .positive()
      .describe('Height of the element in pixels.'),
    caption: z
      .string()
      .min(1)
      .max(140)
      .describe(
        'A short (<140 char) caption that will appear next to the arrow, e.g. "Click here to start a new project".',
      ),
  }),
  execute: async () => ({ highlighted: true as const }),
});

export const pipTools = {
  highlight: highlightTool,
} as const;

export type PipTools = typeof pipTools;
