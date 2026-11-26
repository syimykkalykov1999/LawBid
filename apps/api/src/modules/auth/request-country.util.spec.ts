import { fromOurEdge, requestCountry } from './request-country.util';
import {
  recordSendDuration,
  resetSendLatency,
  simulateSend,
} from './uniform-response.util';

describe('requestCountry', () => {
  const SECRET = 'test-edge-origin-secret-0123456789';
  const edge = { 'x-lawbid-edge': SECRET };
  const hdr = (h: Record<string, string>) => (n: string) => h[n];
  it('reads CloudFront then Cloudflare, upper-cased (request from our edge)', () => {
    expect(
      requestCountry(
        hdr({ ...edge, 'cloudfront-viewer-country': 'us' }),
        SECRET,
      ),
    ).toBe('US');
    expect(requestCountry(hdr({ ...edge, 'cf-ipcountry': 'DE' }), SECRET)).toBe(
      'DE',
    );
  });
  it('ignores unknown / Tor / malformed values', () => {
    for (const v of ['XX', 'T1', 'USA']) {
      expect(
        requestCountry(hdr({ ...edge, 'cf-ipcountry': v }), SECRET),
      ).toBeUndefined();
    }
    expect(requestCountry(hdr(edge), SECRET)).toBeUndefined();
  });
  // ASVS 5.0 V4.1.3 (STAGE2_SECURITY #8): a client cannot pick its country.
  it('a country header straight from a client is not trusted', () => {
    const forged = { 'cloudfront-viewer-country': 'US', 'cf-ipcountry': 'US' };
    expect(requestCountry(hdr(forged), SECRET)).toBeUndefined();
    expect(
      requestCountry(hdr({ ...forged, 'x-lawbid-edge': 'guess' }), SECRET),
    ).toBeUndefined();
    // No secret configured: never trusted.
    expect(
      requestCountry(hdr({ ...forged, ...edge }), undefined),
    ).toBeUndefined();
    expect(requestCountry(hdr({ ...forged, ...edge }), '')).toBeUndefined();
  });
  it('the edge secret must be long enough and match exactly', () => {
    expect(fromOurEdge(SECRET, SECRET)).toBe(true);
    expect(fromOurEdge(`${SECRET}x`, SECRET)).toBe(false);
    expect(fromOurEdge('short', 'short')).toBe(false);
    expect(fromOurEdge(undefined, SECRET)).toBe(false);
  });
});

describe('simulateSend', () => {
  afterEach(() => {
    jest.useRealTimers();
    resetSendLatency();
  });
  it('waits about as long as real sends lately took; 0 when nothing is known', async () => {
    jest.useFakeTimers();
    await simulateSend(0);
    recordSendDuration(1000);
    let done = false;
    const p = simulateSend(0).then(() => (done = true));
    await jest.advanceTimersByTimeAsync(700);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(600);
    await p;
    expect(done).toBe(true);
  });
});
