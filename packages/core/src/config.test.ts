import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveConfig,
  configFromScriptTag,
  findPipScriptTag,
  PipConfigError,
} from './config.js';

describe('resolveConfig', () => {
  it('throws PipConfigError when endpoint is missing', () => {
    expect(() => resolveConfig({})).toThrow(PipConfigError);
  });

  it('throws with a helpful message mentioning data-pip-endpoint', () => {
    try {
      resolveConfig({});
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PipConfigError);
      expect((error as Error).message).toMatch(/endpoint/i);
      expect((error as Error).message).toMatch(/data-pip-endpoint/);
    }
  });

  it('throws when endpoint is not a string', () => {
    // Runtime junk — devs using plain JS could pass something weird
    expect(() => resolveConfig({ endpoint: 42 as unknown as string })).toThrow(
      PipConfigError,
    );
  });

  it('fills in empty defaults for optional fields', () => {
    const config = resolveConfig({ endpoint: '/api/pip' });
    expect(config.endpoint).toBe('/api/pip');
    expect(config.redact).toEqual([]);
    expect(config.debug).toBe(false);
    expect(config.beforeSend).toBeUndefined();
    expect(config.mountTarget).toBeUndefined();
  });

  it('copies redact array to prevent external mutation', () => {
    const userRedact = ['.a', '.b'];
    const config = resolveConfig({ endpoint: '/x', redact: userRedact });
    userRedact.push('.c');
    expect(config.redact).toEqual(['.a', '.b']);
  });

  it('coerces truthy debug values to boolean true', () => {
    const config = resolveConfig({ endpoint: '/x', debug: 1 as unknown as boolean });
    expect(config.debug).toBe(true);
  });

  it('only keeps optional callbacks when explicitly supplied', () => {
    const hook = () => ({}) as never;
    const withHook = resolveConfig({ endpoint: '/x', beforeSend: hook });
    expect(withHook.beforeSend).toBe(hook);

    const without = resolveConfig({ endpoint: '/x' });
    expect('beforeSend' in without).toBe(false);
  });
});

describe('configFromScriptTag', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('returns null for a null script', () => {
    expect(configFromScriptTag(null)).toBeNull();
  });

  it('returns null when data-pip-endpoint is missing', () => {
    const script = document.createElement('script');
    script.src = '/some/pip.js';
    expect(configFromScriptTag(script)).toBeNull();
  });

  it('extracts a basic endpoint', () => {
    const script = document.createElement('script');
    script.dataset['pipEndpoint'] = '/api/pip';
    expect(configFromScriptTag(script)).toEqual({
      endpoint: '/api/pip',
      debug: false,
    });
  });

  it('parses comma-separated redact selectors and trims them', () => {
    const script = document.createElement('script');
    script.dataset['pipEndpoint'] = '/api/pip';
    script.dataset['pipRedact'] = ' .email ,  #ssn ,[data-x="y"]';
    const config = configFromScriptTag(script);
    expect(config?.redact).toEqual(['.email', '#ssn', '[data-x="y"]']);
  });

  it('drops empty selectors from redact', () => {
    const script = document.createElement('script');
    script.dataset['pipEndpoint'] = '/api/pip';
    script.dataset['pipRedact'] = '.a,,,.b, ';
    expect(configFromScriptTag(script)?.redact).toEqual(['.a', '.b']);
  });

  it('enables debug when the attribute is present (any value)', () => {
    const script = document.createElement('script');
    script.dataset['pipEndpoint'] = '/api/pip';
    script.dataset['pipDebug'] = '';
    expect(configFromScriptTag(script)?.debug).toBe(true);
  });

  it('omits debug when the attribute is absent', () => {
    const script = document.createElement('script');
    script.dataset['pipEndpoint'] = '/api/pip';
    expect(configFromScriptTag(script)?.debug).toBe(false);
  });
});

describe('findPipScriptTag', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('returns null when no script tags exist', () => {
    expect(findPipScriptTag()).toBeNull();
  });

  it('finds a script whose src contains "pip"', () => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@pip-help/core/dist/iife.js';
    document.head.appendChild(script);
    expect(findPipScriptTag()).toBe(script);
  });

  it('finds a script by data-pip-endpoint even when src does not match', () => {
    const script = document.createElement('script');
    script.src = 'https://example.com/bundle.js';
    script.dataset['pipEndpoint'] = '/api/pip';
    document.head.appendChild(script);
    expect(findPipScriptTag()).toBe(script);
  });

  it('returns the most recent matching script if there are multiple', () => {
    const a = document.createElement('script');
    a.src = 'https://unpkg.com/@pip-help/core/iife.js';
    document.head.appendChild(a);
    const b = document.createElement('script');
    b.src = 'https://cdn.example.com/pip-help.js';
    document.head.appendChild(b);
    // Last-one-wins — the parser scans from the end
    expect(findPipScriptTag()).toBe(b);
  });

  it('ignores scripts with unrelated sources', () => {
    const jquery = document.createElement('script');
    jquery.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
    document.head.appendChild(jquery);
    expect(findPipScriptTag()).toBeNull();
  });
});
