'use client';

/**
 * Mounts the pip widget on the demo page.
 *
 * This is a dedicated client component so the surrounding `layout.tsx` can
 * stay a Server Component. `@pip-help/core` touches `document` and `window`
 * on import so it has to be kept off the server render path. A client
 * effect with an empty dep array is the cleanest way to do that.
 *
 * Double-mounts are a no-op (the core module guards against them) so
 * React Strict Mode's double-invocation in dev is safe.
 */

import { useEffect } from 'react';
import { mount } from '@pip-help/core';

export function PipMount() {
  useEffect(() => {
    mount({
      endpoint: '/api/pip',
      debug: process.env.NODE_ENV === 'development',
    });
  }, []);
  return null;
}
