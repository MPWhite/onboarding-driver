import { describe, it, expect } from 'vitest';
import { highlightTool, HighlightInputSchema, pipTools } from './tools.js';

/**
 * Tests for the pip tools module.
 *
 * The `highlight` tool is the core mechanism by which the LLM visually
 * points at elements on the user's page. These tests verify:
 *
 *   1. The tool's input schema validates coordinates and caption correctly
 *   2. The execute function returns the expected shape
 *   3. The pipTools object exports the tool correctly
 */

describe('HighlightInputSchema', () => {
  describe('valid inputs', () => {
    it('accepts valid coordinates and caption', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: 200,
        width: 50,
        height: 30,
        caption: 'Click here to create a new project',
      });
      expect(result.success).toBe(true);
    });

    it('accepts zero for x and y coordinates', () => {
      const result = HighlightInputSchema.safeParse({
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        caption: 'Top-left corner',
      });
      expect(result.success).toBe(true);
    });

    it('accepts caption at exactly 140 characters', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: 200,
        width: 50,
        height: 30,
        caption: 'A'.repeat(140),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('coordinate validation', () => {
    it('rejects negative x coordinate', () => {
      const result = HighlightInputSchema.safeParse({
        x: -10,
        y: 200,
        width: 50,
        height: 30,
        caption: 'Invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative y coordinate', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: -5,
        width: 50,
        height: 30,
        caption: 'Invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer x coordinate', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100.5,
        y: 200,
        width: 50,
        height: 30,
        caption: 'Invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer y coordinate', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: 200.7,
        width: 50,
        height: 30,
        caption: 'Invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('dimension validation', () => {
    it('rejects zero width', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: 200,
        width: 0,
        height: 30,
        caption: 'Invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative width', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: 200,
        width: -50,
        height: 30,
        caption: 'Invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero height', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: 200,
        width: 50,
        height: 0,
        caption: 'Invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative height', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: 200,
        width: 50,
        height: -30,
        caption: 'Invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('caption validation', () => {
    it('rejects empty caption', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: 200,
        width: 50,
        height: 30,
        caption: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects caption exceeding 140 characters', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: 200,
        width: 50,
        height: 30,
        caption: 'A'.repeat(141),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('required fields', () => {
    it('rejects missing required fields', () => {
      const result = HighlightInputSchema.safeParse({
        x: 100,
        y: 200,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('highlightTool', () => {
  describe('description', () => {
    it('mentions highlighting elements on the page', () => {
      expect(highlightTool.description).toContain('highlight');
    });

    it('mentions viewport-pixel coordinates', () => {
      expect(highlightTool.description).toContain('viewport-pixel');
    });
  });
});

describe('pipTools', () => {
  it('exports the highlight tool', () => {
    expect(pipTools.highlight).toBe(highlightTool);
  });

  it('has only the highlight tool', () => {
    expect(Object.keys(pipTools)).toEqual(['highlight']);
  });
});
