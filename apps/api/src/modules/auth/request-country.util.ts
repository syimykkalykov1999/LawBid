/**
 * 2026-10-25 (S14-4): the country of the caller as a CDN / load balancer
 * reports it. CloudFront adds `CloudFront-Viewer-Country` when the origin
 * request policy forwards it; Cloudflare sends `CF-IPCountry`. Nothing is
 * looked up by IP here (no geo database is shipped): without the header the
 * country is unknown and the "new country" checks stay quiet.
 */
const COUNTRY_HEADERS = ['cloudfront-viewer-country', 'cf-ipcountry'] as const;

export function requestCountry(
  header: (name: string) => string | undefined,
): string | undefined {
  for (const name of COUNTRY_HEADERS) {
    const raw = header(name)?.trim().toUpperCase();
    // XX = unknown, T1 = Tor (Cloudflare): neither says where the person is.
    if (raw && /^[A-Z]{2}$/.test(raw) && raw !== 'XX' && raw !== 'T1') {
      return raw;
    }
  }
  return undefined;
}
