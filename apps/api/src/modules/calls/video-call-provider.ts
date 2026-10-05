import type { ConfigService } from '@nestjs/config';
import type { SecretsService } from '../../common/secrets/secrets.service';

/** Owner 2026-10-05: the feature flag that shows the "Видеозвонок" button. */
export const VIDEO_CALLS_FLAG = 'video_calls';

export type VideoCallUnavailableReason = 'flag_off' | 'provider_not_configured';

/**
 * Who carries the picture of a video call. Today: `webrtc` — the same
 * device-to-device WebRTC as audio calls (no paid service), relayed by
 * our TURN server when the networks need it. Another provider (a hosted
 * SFU) would implement this and be picked here.
 */
export interface VideoCallProvider {
  readonly name: 'webrtc';
  /** Keys present (Admin → Integrations, or the server env). */
  isConfigured(): Promise<boolean>;
}

/** WebRTC + TURN. Video over NAT needs TURN in production; development
 * (emulators on one LAN) works with STUN alone. */
export class WebRtcVideoProvider implements VideoCallProvider {
  readonly name = 'webrtc' as const;

  constructor(
    private readonly secrets: Pick<SecretsService, 'get'> | undefined,
    private readonly config: Pick<ConfigService, 'get'> | undefined,
  ) {}

  async isConfigured(): Promise<boolean> {
    const env = this.config?.get<string>('NODE_ENV');
    if (env === 'development' || env === 'test') return true;
    const f = (await this.secrets?.get('turn'))?.fields ?? {};
    const urls = f.urls ?? this.config?.get<string>('TURN_URLS') ?? '';
    const secret = f.secret ?? this.config?.get<string>('TURN_SECRET') ?? '';
    return urls.trim().length > 0 && secret.length > 0;
  }
}

/** Flag on AND the provider configured — what the app's button follows. */
export async function videoCallAvailability(
  flagOn: boolean,
  provider: VideoCallProvider,
): Promise<{ available: boolean; reason: VideoCallUnavailableReason | null }> {
  if (!flagOn) return { available: false, reason: 'flag_off' };
  if (!(await provider.isConfigured())) {
    return { available: false, reason: 'provider_not_configured' };
  }
  return { available: true, reason: null };
}
