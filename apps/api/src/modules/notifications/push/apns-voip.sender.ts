import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { connect, type ClientHttp2Session } from 'node:http2';
import { PinoLogger } from 'nestjs-pino';
import { SecretsService } from '../../../common/secrets/secrets.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import {
  type ApnsEnvironment,
  type VoipDevice,
  VoipTokensService,
} from './voip-tokens.service';

const HOSTS: Record<ApnsEnvironment, string> = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
};
/** Apple accepts a provider token for up to an hour; renew before. */
const JWT_TTL_MS = 40 * 60 * 1000;
const APNS_TIMEOUT_MS = 8000;
/** LC-1: which iPhones a call rang by VoIP, kept a little longer than any
 * ring (CallKit 45 s, server 65 s) so «stop ringing» reaches exactly them. */
const RANG_TTL_SEC = 180;
/** The iPhone's own CallKit ring ends itself after 45 s (AppDelegate
 * data.duration): a later stop (missed at the server's 65 s) would only
 * make a phone that is quiet already flash a call to end it. */
const PHONE_RING_MS = 44_000;
const rangKey = (callId: string, userId: string) =>
  `push:voip:rang:${callId}:${userId}`;

/** What the iPhone needs to show the call screen (AppDelegate.swift). */
export interface VoipCallPayload {
  callId: string;
  conversationId: string;
  callerName: string;
  /** Owner 2026-10-26: the caller's photo (a public CDN link, or none). */
  avatarUrl?: string | null;
  video: boolean;
  silent: boolean;
}

/**
 * Owner 2026-10-26 (calls arrive without the photo / not at all on a
 * locked iPhone): the one VoIP push Apple gets for a ringing call —
 * `apns-push-type: voip`, priority 10, the `<bundle>.voip` topic, and the
 * keys AppDelegate.swift reads (callId, callerName, avatarUrl, video,
 * silent). Pure, so the payload is tested without a network.
 */
export function voipRequest(
  device: { token: string; topic: string },
  call: VoipCallPayload,
  auth: string,
): { headers: Record<string, string>; body: string } {
  return {
    headers: {
      ':method': 'POST',
      ':path': `/3/device/${device.token}`,
      authorization: `bearer ${auth}`,
      'apns-topic': device.topic,
      'apns-push-type': 'voip',
      'apns-priority': '10',
      // A call is useless later: deliver now or never.
      'apns-expiration': '0',
      'apns-collapse-id': call.callId.slice(0, 64),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: {},
      callId: call.callId,
      conversationId: call.conversationId,
      callerName: call.callerName,
      ...(call.avatarUrl ? { avatarUrl: call.avatarUrl } : {}),
      video: call.video ? '1' : '0',
      silent: call.silent ? '1' : '0',
    }),
  };
}

/**
 * LC-1 (audit 2026-10-26): «stop ringing» as a VoIP push. A locked or
 * closed iPhone does not get the silent FCM/background push in time (Apple
 * delays priority-5 pushes and never wakes a force-quit app with them), so
 * CallKit rang on until its 45 s timeout. Same topic / priority / collapse
 * id as the ring: if the ring is still waiting at Apple (phone offline),
 * this one replaces it. AppDelegate.swift ends the CallKit call (or, when
 * none is shown, reports and ends one at once, as iOS requires).
 */
export function voipEndRequest(
  device: { token: string; topic: string },
  callId: string,
  auth: string,
): { headers: Record<string, string>; body: string } {
  return {
    headers: {
      ':method': 'POST',
      ':path': `/3/device/${device.token}`,
      authorization: `bearer ${auth}`,
      'apns-topic': device.topic,
      'apns-push-type': 'voip',
      'apns-priority': '10',
      'apns-expiration': '0',
      'apns-collapse-id': callId.slice(0, 64),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ aps: {}, type: 'call_ended', callId }),
  };
}

type RangDevice = Omit<VoipDevice, 'sessionId'>;

type SendOutcome = 'ok' | 'gone' | 'wrong_env' | 'failed';

/**
 * Owner 2026-10-17: incoming calls on iPhones as VoIP (PushKit) pushes
 * straight to Apple — FCM can't send them, and Apple requires them for
 * apps that ring with CallKit. Keys: admin «Интеграции» → Apple Push, or
 * APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY. Without keys nothing is
 * sent (the regular push still rings while the app runs).
 */
@Injectable()
export class ApnsVoipSender {
  private key?: { fingerprint: string; object: KeyObject };
  private jwt?: { value: string; at: number; fingerprint: string };
  private readonly sessions = new Map<ApnsEnvironment, ClientHttp2Session>();

  constructor(
    private readonly secrets: SecretsService,
    private readonly tokens: VoipTokensService,
    private readonly logger: PinoLogger,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /** Rings [userId]'s iPhones; returns the sessions that got the push
   * (their FCM call push is skipped). Never throws. */
  async ringCall(userId: string, call: VoipCallPayload): Promise<string[]> {
    try {
      const auth = await this.providerToken();
      if (!auth) {
        this.logger.warn({ callId: call.callId }, 'apns skipped: no key');
        return [];
      }
      const devices = await this.tokens.activeDevices(userId);
      const rang: string[] = [];
      const rangDevices: RangDevice[] = [];
      for (const device of devices) {
        if ((await this.sendWithFallback(device, call, auth)) === 'ok') {
          rang.push(device.sessionId);
          rangDevices.push({
            token: device.token,
            topic: device.topic,
            environment: device.environment,
            chainId: device.chainId,
          });
        }
      }
      await this.rememberRang(call.callId, userId, rangDevices);
      this.logger.info(
        { callId: call.callId, devices: devices.length, rang: rang.length },
        'apns voip ring done',
      );
      return rang;
    } catch (err) {
      this.logger.warn({ err }, 'apns voip push failed');
      return [];
    }
  }

  /**
   * LC-1: the call stopped ringing (caller hung up, missed, declined or
   * answered on another device) — the iPhones it rang by VoIP get a VoIP
   * «call_ended» at once. Only those phones (a phone never rung would have
   * to flash a CallKit call just to end it), only while the phone's own
   * 45 s ring is still on, and never the phone that answered or declined
   * ([exceptChainId], its sign-in chain). Returns how many got it.
   * Never throws.
   */
  async endCall(
    userId: string,
    callId: string,
    exceptChainId?: string,
  ): Promise<number> {
    try {
      if (!this.redis) return 0;
      const key = rangKey(callId, userId);
      const raw = await this.redis.get(key);
      if (!raw) return 0;
      await this.redis.del(key);
      const note = JSON.parse(raw) as { at: number; devices: RangDevice[] };
      if (Date.now() - note.at > PHONE_RING_MS) return 0;
      const devices = note.devices.filter(
        (d) => !exceptChainId || d.chainId !== exceptChainId,
      );
      if (devices.length === 0) return 0;
      const auth = await this.providerToken();
      if (!auth) return 0;
      let sent = 0;
      for (const d of devices) {
        const out = await this.post(
          d.environment,
          voipEndRequest(d, callId, auth),
        );
        if (out === 'ok') sent += 1;
      }
      this.logger.info(
        { callId, devices: devices.length, sent },
        'apns voip stop-ringing done',
      );
      return sent;
    } catch (err) {
      this.logger.warn({ err }, 'apns voip stop-ringing failed');
      return 0;
    }
  }

  private async rememberRang(
    callId: string,
    userId: string,
    devices: RangDevice[],
  ): Promise<void> {
    if (!this.redis || devices.length === 0) return;
    try {
      await this.redis.set(
        rangKey(callId, userId),
        JSON.stringify({ at: Date.now(), devices }),
        'EX',
        RANG_TTL_SEC,
      );
    } catch {
      // Without the note the silent FCM stop still goes out.
    }
  }

  /** Development-signed builds get sandbox tokens; a build may also be
   * signed for the other environment than it said — try both once. */
  private async sendWithFallback(
    device: VoipDevice,
    call: VoipCallPayload,
    auth: string,
  ): Promise<SendOutcome> {
    const first = await this.send(device, device.environment, call, auth);
    if (first !== 'wrong_env') {
      if (first === 'gone') await this.tokens.remove(device.token);
      return first;
    }
    const other: ApnsEnvironment =
      device.environment === 'sandbox' ? 'production' : 'sandbox';
    const second = await this.send(device, other, call, auth);
    if (second === 'ok') {
      await this.tokens.setEnvironment(device.token, other);
      // The stop-ringing push goes where the ring got through.
      device.environment = other;
    }
    if (second === 'gone' || second === 'wrong_env') {
      await this.tokens.remove(device.token);
    }
    return second;
  }

  private send(
    device: VoipDevice,
    env: ApnsEnvironment,
    call: VoipCallPayload,
    auth: string,
  ): Promise<SendOutcome> {
    return this.post(env, voipRequest(device, call, auth));
  }

  private post(
    env: ApnsEnvironment,
    request: { headers: Record<string, string>; body: string },
  ): Promise<SendOutcome> {
    return new Promise((resolve) => {
      let session: ClientHttp2Session;
      try {
        session = this.session(env);
      } catch {
        resolve('failed');
        return;
      }
      const { headers, body } = request;
      const req = session.request(headers);
      req.setTimeout(APNS_TIMEOUT_MS, () => {
        req.close();
        resolve('failed');
      });
      let status = 0;
      let text = '';
      req.on('response', (h) => {
        status = Number(h[':status'] ?? 0);
      });
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        text += chunk;
      });
      req.on('end', () => {
        if (status === 200) return resolve('ok');
        const reason = safeReason(text);
        if (status === 410 || reason === 'Unregistered') {
          return resolve('gone');
        }
        if (
          reason === 'BadDeviceToken' ||
          reason === 'BadEnvironmentKeyInToken'
        ) {
          return resolve('wrong_env');
        }
        this.logger.warn({ status, reason, env }, 'apns voip push refused');
        resolve('failed');
      });
      req.on('error', () => resolve('failed'));
      req.end(body);
    });
  }

  private session(env: ApnsEnvironment): ClientHttp2Session {
    const open = this.sessions.get(env);
    if (open && !open.closed && !open.destroyed) return open;
    const s = connect(HOSTS[env]);
    s.on('error', () => this.sessions.delete(env));
    s.on('close', () => this.sessions.delete(env));
    // Don't keep the process alive just for an idle connection.
    s.unref();
    this.sessions.set(env, s);
    return s;
  }

  /** The ES256 provider token (JWT) from the current keys; null = none. */
  private async providerToken(): Promise<string | null> {
    const c = await this.secrets.get('apns');
    const f = c?.fields ?? {};
    if (!c || !f.keyId || !f.teamId || !f.privateKey) return null;
    if (this.key?.fingerprint !== c.fingerprint) {
      this.key = {
        fingerprint: c.fingerprint,
        object: createPrivateKey(f.privateKey),
      };
      this.jwt = undefined;
    }
    const now = Date.now();
    if (
      this.jwt &&
      this.jwt.fingerprint === c.fingerprint &&
      now - this.jwt.at < JWT_TTL_MS
    ) {
      return this.jwt.value;
    }
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b64({ alg: 'ES256', kid: f.keyId });
    const claims = b64({ iss: f.teamId, iat: Math.floor(now / 1000) });
    const signature = sign('sha256', Buffer.from(`${head}.${claims}`), {
      key: this.key.object,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
    const value = `${head}.${claims}.${signature}`;
    this.jwt = { value, at: now, fingerprint: c.fingerprint };
    return value;
  }
}

function safeReason(text: string): string | undefined {
  try {
    return (JSON.parse(text) as { reason?: string }).reason;
  } catch {
    return undefined;
  }
}
