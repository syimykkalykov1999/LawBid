import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * 2026-10-25 (S14-4): the country of the caller as a CDN reports it.
 * CloudFront adds `CloudFront-Viewer-Country` when the origin request policy
 * forwards it; Cloudflare sends `CF-IPCountry`. Nothing is looked up by IP
 * here (no geo database is shipped): without the header the country is
 * unknown and the "new country" checks stay quiet.
 *
 * ASVS 5.0 V4.1.3 (STAGE2_SECURITY #8): those headers are trusted ONLY when
 * the request also carries our edge secret, `X-LawBid-Edge:
 * <EDGE_ORIGIN_SECRET>`. That is the CloudFront «custom origin header»
 * pattern (AWS: «Restricting access to Application Load Balancers»): the CDN
 * adds the header on its way to the origin, a client cannot know the value.
 * The API sits straight on the load balancer today, so anyone could send
 * `CloudFront-Viewer-Country: <the victim's usual country>` and silence the
 * «new country» alert. No secret configured, or a wrong / missing header →
 * the country is unknown. The comparison is constant-time.
 */
const COUNTRY_HEADERS = ['cloudfront-viewer-country', 'cf-ipcountry'] as const;
export const EDGE_SECRET_HEADER = 'x-lawbid-edge';

const digest = (v: string): Buffer => createHash('sha256').update(v).digest();

/** True when [sent] is our edge secret (both hashed first: equal length). */
export function fromOurEdge(
  sent: string | undefined,
  secret: string | undefined = process.env.EDGE_ORIGIN_SECRET,
): boolean {
  const s = secret?.trim();
  if (!s || s.length < 16 || !sent) return false;
  return timingSafeEqual(digest(sent.trim()), digest(s));
}

export function requestCountry(
  header: (name: string) => string | undefined,
  secret: string | undefined = process.env.EDGE_ORIGIN_SECRET,
): string | undefined {
  if (!fromOurEdge(header(EDGE_SECRET_HEADER), secret)) return undefined;
  for (const name of COUNTRY_HEADERS) {
    const raw = header(name)?.trim().toUpperCase();
    // XX = unknown, T1 = Tor (Cloudflare): neither says where the person is.
    if (raw && /^[A-Z]{2}$/.test(raw) && raw !== 'XX' && raw !== 'T1') {
      return raw;
    }
  }
  return undefined;
}
