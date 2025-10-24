// Polyfills for browser compatibility
import { Buffer } from 'buffer';

// Make Buffer available globally
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  (window as any).global = window;
  (window as any).process = {
    env: {},
    browser: true,
    version: '',
    versions: {},
  };
}

export {};

