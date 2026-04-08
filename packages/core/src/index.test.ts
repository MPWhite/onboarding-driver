import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, getActiveInstance, VERSION, PipConfigError } from './index.js';

/**
 * Tests for the top-level mount() public API. This is the entry point
 * every consumer calls, and until now it had zero direct coverage — the
 * other tests exercise individual subsystems in isolation.
 *
 * We stub the capture module (imported indirectly via the transport
 * controller) so mount() can proceed through its full construction
 * pipeline without touching html-to-image.
 */

vi.mock('./capture/index.js', () => ({
  capturePage: vi.fn(async () => ({
    screenshot: 'data:image/png;base64,FAKE',
    dom: '',
    url: 'https://example.com/',
    title: 'Test',
    viewport: { width: 800, height: 600, devicePixelRatio: 1 },
  })),
}));

beforeEach(() => {
  document.body.innerHTML = '';
  // Clean up any instance a prior test may have left mounted.
  getActiveInstance()?.destroy();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

afterEach(() => {
  getActiveInstance()?.destroy();
});

describe('mount', () => {
  it('exports a non-empty VERSION string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('throws PipConfigError if endpoint is missing', () => {
    expect(() => mount({})).toThrow(PipConfigError);
  });

  it('returns a PipInstance with the expected methods', () => {
    const instance = mount({ endpoint: '/api/pip' });
    expect(instance.open).toBeTypeOf('function');
    expect(instance.close).toBeTypeOf('function');
    expect(instance.setPaused).toBeTypeOf('function');
    expect(instance.isPaused).toBeTypeOf('function');
    expect(instance.destroy).toBeTypeOf('function');
    expect(instance.config.endpoint).toBe('/api/pip');
  });

  it('attaches a host element to document.body (or the configured mountTarget)', () => {
    mount({ endpoint: '/api/pip' });
    const host = document.body.querySelector('[data-pip-host]');
    expect(host).toBeTruthy();
  });

  it('supports an explicit mountTarget', () => {
    const container = document.createElement('div');
    container.id = 'custom-mount';
    document.body.appendChild(container);
    mount({ endpoint: '/api/pip', mountTarget: container });
    expect(container.querySelector('[data-pip-host]')).toBeTruthy();
    // The default document.body should NOT have it (except inside the container)
    const directChildren = Array.from(document.body.children);
    expect(directChildren.some((c) => c.hasAttribute('data-pip-host'))).toBe(false);
  });

  it('double-mount returns the same instance (no stacking)', () => {
    const first = mount({ endpoint: '/api/pip' });
    const second = mount({ endpoint: '/api/pip' });
    expect(second).toBe(first);
    const hosts = document.body.querySelectorAll('[data-pip-host]');
    expect(hosts).toHaveLength(1);
  });

  it('getActiveInstance returns the current instance', () => {
    expect(getActiveInstance()).toBeNull();
    const instance = mount({ endpoint: '/api/pip' });
    expect(getActiveInstance()).toBe(instance);
  });

  it('destroy() removes the host from the DOM and clears the active instance', () => {
    const instance = mount({ endpoint: '/api/pip' });
    expect(document.body.querySelector('[data-pip-host]')).toBeTruthy();
    instance.destroy();
    expect(document.body.querySelector('[data-pip-host]')).toBeNull();
    expect(getActiveInstance()).toBeNull();
  });

  it('can re-mount after destroy()', () => {
    const first = mount({ endpoint: '/api/pip' });
    first.destroy();
    const second = mount({ endpoint: '/api/pip' });
    expect(second).not.toBe(first);
    expect(getActiveInstance()).toBe(second);
  });

  it('setPaused(true) persists to localStorage as denied', () => {
    const instance = mount({ endpoint: '/api/pip' });
    instance.setPaused(true);
    expect(instance.isPaused()).toBe(true);
    const stored = JSON.parse(localStorage.getItem('pip-consent') ?? '{}');
    expect(stored.value).toBe('denied');
  });

  it('starts paused when prior consent was denied in localStorage', () => {
    localStorage.setItem(
      'pip-consent',
      JSON.stringify({ value: 'denied', timestamp: Date.now() }),
    );
    const instance = mount({ endpoint: '/api/pip' });
    expect(instance.isPaused()).toBe(true);
  });

  it('does not start paused when prior consent was granted', () => {
    localStorage.setItem(
      'pip-consent',
      JSON.stringify({ value: 'granted', timestamp: Date.now() }),
    );
    const instance = mount({ endpoint: '/api/pip' });
    expect(instance.isPaused()).toBe(false);
  });

  it('throws a helpful error if mount() runs before document.body exists', () => {
    // Temporarily remove body to simulate pre-DOMContentLoaded script execution
    const originalBody = document.body;
    Object.defineProperty(document, 'body', {
      configurable: true,
      get: () => null,
    });
    try {
      expect(() => mount({ endpoint: '/api/pip' })).toThrow(/before.*body.*exist/i);
    } finally {
      Object.defineProperty(document, 'body', {
        configurable: true,
        get: () => originalBody,
      });
    }
  });
});
