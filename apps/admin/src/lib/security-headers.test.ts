// @vitest-environment node
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

// ASVS 5.0 V3.4.8 (STAGE2_SECURITY #5): every admin document is COOP
// same-origin, next to the other security headers.
describe('admin security headers', () => {
  it('sends Cross-Origin-Opener-Policy: same-origin on every page', async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === '/(.*)');
    expect(all?.headers).toContainEqual({ key: 'Cross-Origin-Opener-Policy', value: 'same-origin' });
    expect(all?.headers).toContainEqual({ key: 'X-Frame-Options', value: 'DENY' });
  });
});
