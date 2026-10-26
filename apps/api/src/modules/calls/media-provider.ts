/** Who carries a call's media (stored in `calls.media_provider`). */
export type MediaProvider = 'p2p' | 'cloudflare';

export interface MediaDecisionInput {
  /** `calls.video_provider` as the admin set it. */
  providerChoice: string;
  /** 1:1 calls are always device to device (TURN), never the SFU. */
  isGroup: boolean;
  video: boolean;
  /** People the call starts with, the caller included. */
  headcount: number;
  /** Keys present and Cloudflare answering (cached health). */
  sfuHealthy: boolean;
  /** Largest group that keeps its video device to device (default 4). */
  meshVideoMax: number;
}

export interface MediaDecision {
  mediaProvider: MediaProvider;
  /** The picture the call really has (a fallback may turn it off). */
  video: boolean;
  /** Cloudflare was wanted but not used. */
  degraded: boolean;
}

/**
 * Owner 2026-10-24 (corrected): a call is never refused because of the
 * fallback.
 *  - 1:1 calls and every provider other than cloudflare: as before (p2p);
 *  - cloudflare healthy: the group call runs on the SFU, video for all;
 *  - cloudflare down or unconfigured: up to `meshVideoMax` people (4) use
 *    device-to-device with their video; with more people everyone is audio
 *    only (still device to device, seats as in the normal SFU limit). New
 *    calls use the SFU again as soon as Cloudflare is healthy.
 */
export function decideMediaProvider(i: MediaDecisionInput): MediaDecision {
  if (!i.isGroup || i.providerChoice !== 'cloudflare') {
    return { mediaProvider: 'p2p', video: i.video, degraded: false };
  }
  if (i.sfuHealthy) {
    return { mediaProvider: 'cloudflare', video: i.video, degraded: false };
  }
  return {
    mediaProvider: 'p2p',
    video: i.video && i.headcount <= i.meshVideoMax,
    degraded: true,
  };
}
