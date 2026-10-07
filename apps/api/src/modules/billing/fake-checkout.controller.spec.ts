import { fakeCheckoutAllowed } from './billing.constants';
import { escapeHtml } from './fake-checkout.controller';

describe('fake checkout pages (security audit 2026-10-07)', () => {
  it('exist only in development and tests', () => {
    expect(fakeCheckoutAllowed('development')).toBe(true);
    expect(fakeCheckoutAllowed('test')).toBe(true);
    expect(fakeCheckoutAllowed('production')).toBe(false);
    expect(fakeCheckoutAllowed('staging')).toBe(false);
  });

  it('escape request values before they reach the HTML', () => {
    expect(escapeHtml('https://x" onmouseover="alert(1)')).toBe(
      'https://x&quot; onmouseover=&quot;alert(1)',
    );
    expect(escapeHtml("<script>'&")).toBe('&lt;script&gt;&#39;&amp;');
  });
});
