import { requestCountry } from './request-country.util';
import {
  recordSendDuration,
  resetSendLatency,
  simulateSend,
} from './uniform-response.util';

describe('requestCountry', () => {
  const hdr = (h: Record<string, string>) => (n: string) => h[n];
  it('reads CloudFront then Cloudflare, upper-cased', () => {
    expect(requestCountry(hdr({ 'cloudfront-viewer-country': 'us' }))).toBe(
      'US',
    );
    expect(requestCountry(hdr({ 'cf-ipcountry': 'DE' }))).toBe('DE');
  });
  it('ignores unknown / Tor / malformed values', () => {
    expect(requestCountry(hdr({ 'cf-ipcountry': 'XX' }))).toBeUndefined();
    expect(requestCountry(hdr({ 'cf-ipcountry': 'T1' }))).toBeUndefined();
    expect(requestCountry(hdr({ 'cf-ipcountry': 'USA' }))).toBeUndefined();
    expect(requestCountry(hdr({}))).toBeUndefined();
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
