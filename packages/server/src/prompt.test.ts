import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './prompt.js';
import type { PipPageContext } from './types.js';

const SAMPLE_CONTEXT: PipPageContext = {
  url: 'https://example.com/dashboard',
  title: 'Acme Projects — Dashboard',
  viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
  redactedDom:
    '[button] "New project" @ (340, 120, 96, 32)\n[h2] "Your projects" @ (40, 100, 200, 28)',
};

describe('buildSystemPrompt', () => {
  it('includes the base instructions and highlight tool guidance', () => {
    const prompt = buildSystemPrompt({
      contextMarkdown: '# Acme\nSite about widgets.',
      pageContext: SAMPLE_CONTEXT,
    });
    expect(prompt).toContain('pip, a small mouse mascot');
    expect(prompt).toContain('`highlight`');
    expect(prompt).toContain('viewport pixels');
  });

  it('injects the dev context markdown under "About this site"', () => {
    const prompt = buildSystemPrompt({
      contextMarkdown: '# Acme\nSite about widgets.',
      pageContext: SAMPLE_CONTEXT,
    });
    expect(prompt).toContain('## About this site');
    expect(prompt).toContain('# Acme');
    expect(prompt).toContain('Site about widgets.');
  });

  it('renders the page context with URL, title, viewport, and DOM', () => {
    const prompt = buildSystemPrompt({
      contextMarkdown: 'ctx',
      pageContext: SAMPLE_CONTEXT,
    });
    expect(prompt).toContain('URL: https://example.com/dashboard');
    expect(prompt).toContain('Title: Acme Projects — Dashboard');
    expect(prompt).toContain('Viewport: 1440x900 @ 2x');
    expect(prompt).toContain('[button] "New project"');
  });

  it('handles an empty context markdown gracefully', () => {
    const prompt = buildSystemPrompt({
      contextMarkdown: '',
      pageContext: SAMPLE_CONTEXT,
    });
    expect(prompt).toContain(
      '(no context document provided by the site owner)',
    );
  });

  it('handles a whitespace-only context markdown gracefully', () => {
    const prompt = buildSystemPrompt({
      contextMarkdown: '   \n\n\t  ',
      pageContext: SAMPLE_CONTEXT,
    });
    expect(prompt).toContain(
      '(no context document provided by the site owner)',
    );
  });

  it('appends systemPromptExtra when provided', () => {
    const prompt = buildSystemPrompt({
      contextMarkdown: 'ctx',
      pageContext: SAMPLE_CONTEXT,
      extra: 'Always respond in French.',
    });
    expect(prompt).toContain('## Additional instructions');
    expect(prompt).toContain('Always respond in French.');
  });

  it('omits the Additional instructions section when extra is empty', () => {
    const prompt = buildSystemPrompt({
      contextMarkdown: 'ctx',
      pageContext: SAMPLE_CONTEXT,
      extra: '   ',
    });
    expect(prompt).not.toContain('## Additional instructions');
  });

  it('puts About-site before Current-page so the model reads site context first', () => {
    const prompt = buildSystemPrompt({
      contextMarkdown: 'ctx',
      pageContext: SAMPLE_CONTEXT,
    });
    const aboutIdx = prompt.indexOf('## About this site');
    const currentIdx = prompt.indexOf('## Current page');
    expect(aboutIdx).toBeGreaterThan(-1);
    expect(currentIdx).toBeGreaterThan(aboutIdx);
  });
});
