import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Owner 2026-10-04: unit + component tests of the admin (`npm test`).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Node 25+ ships its own global `localStorage` (undefined without
    // --localstorage-file) that shadows jsdom's; Node 26 is no different. Turn
    // the Node one off so jsdom's works (vitest-dev/vitest#8757, 2026-11-07).
    execArgv: ['--no-experimental-webstorage'],
  },
});
