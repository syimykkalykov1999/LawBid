/** Who carries a call's media (stored in `calls.media_provider`). */
export type MediaProvider = 'p2p' | 'cloudflare';

export interface MediaDecisionInput {
  /** 1:1 calls are always device to device (relayed by TURN), never the SFU. */
  isGroup: boolean;
  video: boolean;
  /** People the call starts with, the caller included. */
  headcount: number;
  /** Cloudflare is the transport for this new call (keys present,
   * `calls.transport` not `own`, breaker closed or `cloudflare` forced, no
   * cost hard stop). */
  useCloudflare: boolean;
  /** Cloudflare SHOULD carry group calls (keys present and `calls.transport`
   * not `own`) — false means our own path was chosen on purpose, true with
   * useCloudflare false means the automatic backup is running. */
  cloudflareWanted: boolean;
  /** Largest group that keeps its video device to device (default 4). */
  meshVideoMax: number;
}

export interface MediaDecision {
  mediaProvider: MediaProvider;
  /** The picture the call really has (a fallback may turn it off). */
  video: boolean;
  /** Cloudflare was wanted but not used (the automatic backup). */
  degraded: boolean;
}

/**
 * Owner 2026-10-26: Cloudflare is the primary transport, our own path only
 * the backup; a call is never refused because of the backup.
 *  - 1:1: device to device (Cloudflare TURN relays it; see iceServers);
 *  - group + Cloudflare up: the call runs on the Cloudflare SFU;
 *  - group + own path chosen (no keys / `calls.transport` = own): mesh as
 *    before Cloudflare existed;
 *  - group + Cloudflare wanted but failing (breaker open, cost hard stop):
 *    up to `meshVideoMax` people (4) keep video device to device, more are
 *    audio only. New calls use the SFU again once Cloudflare is back.
 */
export function decideMediaProvider(i: MediaDecisionInput): MediaDecision {
  if (!i.isGroup) {
    return { mediaProvider: 'p2p', video: i.video, degraded: false };
  }
  if (i.useCloudflare) {
    return { mediaProvider: 'cloudflare', video: i.video, degraded: false };
  }
  if (!i.cloudflareWanted) {
    return { mediaProvider: 'p2p', video: i.video, degraded: false };
  }
  return {
    mediaProvider: 'p2p',
    video: i.video && i.headcount <= i.meshVideoMax,
    degraded: true,
  };
}
