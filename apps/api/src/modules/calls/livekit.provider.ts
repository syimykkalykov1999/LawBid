import type { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
  type WebhookEvent,
} from 'livekit-server-sdk';
import type { SecretsService } from '../../common/secrets/secrets.service';
import type { VideoCallProvider } from './video-call-provider';

export interface LiveKitKeys {
  /** wss://… address of the LiveKit server (what the phone connects to). */
  url: string;
  apiKey: string;
  apiSecret: string;
}

export type LiveKitRole = 'host' | 'speaker' | 'listener';

export interface LiveKitJoin {
  url: string;
  token: string;
  room: string;
  identity: string;
  role: LiveKitRole;
  expiresAt: Date;
}

/** Calls never run longer than this; the token's TTL is the same. */
export const LIVEKIT_MAX_CALL_SEC = 4 * 60 * 60;

/** "wss://x.livekit.cloud" → "https://x.livekit.cloud" for the REST API. */
export function livekitHttpUrl(url: string): string {
  return url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

/**
 * Owner 2026-10-22: LiveKit (open-source SFU, self-hosted or cloud) behind
 * the same VideoCallProvider interface as plain WebRTC. Only the server
 * side lives here: a room per call id, short-lived access tokens, and the
 * signature check of LiveKit's webhooks. The phones do not use it until
 * `calls.video_provider` is switched to `livekit` (default `p2p`).
 */
export class LiveKitVideoProvider implements VideoCallProvider {
  readonly name = 'livekit' as const;

  constructor(
    private readonly secrets: Pick<SecretsService, 'get'> | undefined,
    private readonly config: Pick<ConfigService, 'get'> | undefined,
  ) {}

  /** Admin → Integrations → LiveKit, else the server env. */
  async keys(): Promise<LiveKitKeys | null> {
    const f = (await this.secrets?.get('livekit'))?.fields ?? {};
    const url = (f.url ?? this.config?.get<string>('LIVEKIT_URL') ?? '').trim();
    const apiKey = (
      f.apiKey ??
      this.config?.get<string>('LIVEKIT_API_KEY') ??
      ''
    ).trim();
    const apiSecret = (
      f.apiSecret ??
      this.config?.get<string>('LIVEKIT_API_SECRET') ??
      ''
    ).trim();
    return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
  }

  async isConfigured(): Promise<boolean> {
    return (await this.keys()) !== null;
  }

  /** Room per call: the room name is the call id. Creating twice is fine. */
  async ensureRoom(
    keys: LiveKitKeys,
    callId: string,
    maxParticipants: number,
  ): Promise<void> {
    const client = new RoomServiceClient(
      livekitHttpUrl(keys.url),
      keys.apiKey,
      keys.apiSecret,
    );
    await client.createRoom({
      name: callId,
      maxParticipants,
      // An empty room goes away on its own (the webhook then ends the call).
      emptyTimeout: 60,
      departureTimeout: 20,
    });
  }

  /** identity = user id; publish/subscribe follow the role. */
  async issueToken(
    keys: LiveKitKeys,
    callId: string,
    userId: string,
    role: LiveKitRole,
    now = new Date(),
  ): Promise<LiveKitJoin> {
    const token = new AccessToken(keys.apiKey, keys.apiSecret, {
      identity: userId,
      ttl: LIVEKIT_MAX_CALL_SEC,
    });
    token.addGrant({
      roomJoin: true,
      room: callId,
      canPublish: role !== 'listener',
      canPublishData: role !== 'listener',
      canSubscribe: true,
    });
    return {
      url: keys.url,
      token: await token.toJwt(),
      room: callId,
      identity: userId,
      role,
      expiresAt: new Date(now.getTime() + LIVEKIT_MAX_CALL_SEC * 1000),
    };
  }

  /** Verifies the Authorization JWT and the body hash; throws on failure. */
  async verifyWebhook(
    keys: LiveKitKeys,
    rawBody: string,
    authorization: string | undefined,
  ): Promise<WebhookEvent> {
    return new WebhookReceiver(keys.apiKey, keys.apiSecret).receive(
      rawBody,
      authorization,
    );
  }
}
