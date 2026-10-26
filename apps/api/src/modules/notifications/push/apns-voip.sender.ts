import { Injectable } from '@nestjs/common';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { connect, type ClientHttp2Session } from 'node:http2';
import { PinoLogger } from 'nestjs-pino';
import { SecretsService } from '../../../common/secrets/secrets.service';
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
      for (const device of devices) {
        if ((await this.sendWithFallback(device, call, auth)) === 'ok') {
          rang.push(device.sessionId);
        }
      }
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
    if (second === 'ok') await this.tokens.setEnvironment(device.token, other);
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
    return new Promise((resolve) => {
      let session: ClientHttp2Session;
      try {
        session = this.session(env);
      } catch {
        resolve('failed');
        return;
      }
      const { headers, body } = voipRequest(device, call, auth);
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
