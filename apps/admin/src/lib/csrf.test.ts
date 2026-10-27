import { describe, expect, it } from 'vitest';
import { bodyTypeAllowed, crossSiteReason, lastForwardedFor } from './csrf';

const req = (method: string, headers: Record<string, string> = {}) =>
  new Request('http://admin.test/api/proxy/users', { method, headers });

describe('crossSiteReason (S18-5)', () => {
  it('lets reads through whatever the origin', () => {
    expect(crossSiteReason(req('GET', { 'sec-fetch-site': 'cross-site' }))).toBeNull();
  });
  it('accepts same-origin writes', () => {
    expect(crossSiteReason(req('POST', { 'sec-fetch-site': 'same-origin' }))).toBeNull();
  });
  it.each(['same-site', 'cross-site', 'none'])('refuses a write with sec-fetch-site=%s', (site) => {
    expect(crossSiteReason(req('DELETE', { 'sec-fetch-site': site }))).not.toBeNull();
  });
  it('falls back to Origin vs Host without Fetch Metadata', () => {
    expect(crossSiteReason(req('POST', { origin: 'https://admin.test', host: 'admin.test' }))).toBeNull();
    expect(crossSiteReason(req('POST', { origin: 'https://evil.test', host: 'admin.test' }))).not.toBeNull();
  });
  it('allows a non-browser client that sends neither header', () => {
    expect(crossSiteReason(req('POST'))).toBeNull();
  });
});

describe('bodyTypeAllowed (S18-5)', () => {
  it('accepts JSON and multipart', () => {
    expect(bodyTypeAllowed(req('POST', { 'content-type': 'application/json; charset=utf-8' }))).toBe(true);
    expect(bodyTypeAllowed(req('POST', { 'content-type': 'multipart/form-data; boundary=x' }))).toBe(true);
  });
  it('refuses the CORS-simple types', () => {
    expect(bodyTypeAllowed(req('POST', { 'content-type': 'text/plain' }))).toBe(false);
    expect(bodyTypeAllowed(req('POST', { 'content-type': 'application/x-www-form-urlencoded' }))).toBe(false);
  });
  it('lets a bodyless POST through', () => {
    expect(bodyTypeAllowed(req('POST'))).toBe(true);
  });
});

describe('lastForwardedFor (S18-7)', () => {
  it('keeps only the entry our own load balancer appended', () => {
    expect(lastForwardedFor('6.6.6.6, 1.2.3.4')).toBe('1.2.3.4');
    expect(lastForwardedFor('1.2.3.4')).toBe('1.2.3.4');
    expect(lastForwardedFor(null)).toBe('');
  });
});
