import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Owner 2026-10-04: unit + component tests of the admin (`npm test`).
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
