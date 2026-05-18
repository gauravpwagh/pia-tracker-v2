import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Tear down React Testing Library between tests
afterEach(() => {
  cleanup();
});

// JSDOM doesn't implement matchMedia; stub it for the theme store and any
// component that listens to color-scheme changes.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {}, // deprecated, but some libs still call it
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
