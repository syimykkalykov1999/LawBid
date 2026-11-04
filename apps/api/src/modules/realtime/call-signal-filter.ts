/**
 * Owner 2026-11-04 (`calls.own_fallback` = off, calls only through Cloudflare):
 * phones that do not know `iceTransportPolicy` still offer their own addresses
 * (host, srflx). They never reach the other phone: with only relay candidates
 * on both sides, media can go only through the relay.
 */
const NOT_RELAY = /\btyp (host|srflx|prflx)\b/;

/** The signal to pass on, or null when nothing of it may pass. */
export function relayOnlySignal(data: object): object | null {
  const d = data as { type?: unknown; candidate?: unknown; sdp?: unknown };
  if (d.type === 'candidate') {
    return typeof d.candidate === 'string' && NOT_RELAY.test(d.candidate)
      ? null
      : data;
  }
  if (typeof d.sdp === 'string') {
    const sdp = d.sdp
      .split('\r\n')
      .filter((l) => !(l.startsWith('a=candidate:') && NOT_RELAY.test(l)))
      .join('\r\n');
    return { ...data, sdp };
  }
  return data;
}
