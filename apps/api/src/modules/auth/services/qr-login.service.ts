import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { createHash, randomBytes } from 'node:crypto';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { AuthService } from '../auth.service';
import { AuthEventService, AUTH_EVENT_TYPES } from './auth-event.service';
import { RateLimitService } from './rate-limit.service';
import type { DeviceInfo, RequestMeta } from './session.service';
import type {
  QrLoginCreatedDto,
  QrLoginPollResultDto,
  QrLoginPreviewDto,
} from '../dto/qr-login.dto';

/** A sign-in QR code lives two minutes; the website then asks for a new one. */
export const QR_LOGIN_TTL_SEC = 120;
const KEY = (qrId: string) => `auth:qr:${qrId}`;

type QrStatus = 'pending' | 'scanned' | 'approved' | 'rejected';

interface QrState {
  secretHash: string;
  status: QrStatus;
  device: DeviceInfo;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  /** Who opened the confirm screen / answered. */
  userId?: string;
}

// Atomic state change that keeps the key's TTL. KEYS[1] = key;
// ARGV[1] = allowed current statuses (comma list); ARGV[2] = new status;
// ARGV[3] = user id that must match when the state already has one ('' = any);
// ARGV[4] = user id to store. Returns the new JSON, or false.
const TRANSITION_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
local st = cjson.decode(raw)
local ok = false
for s in string.gmatch(ARGV[1], '[^,]+') do
  if s == st.status then ok = true end
end
if not ok then return false end
if ARGV[3] ~= '' and st.userId ~= nil and st.userId ~= ARGV[3] then return false end
st.status = ARGV[2]
if ARGV[4] ~= '' then st.userId = ARGV[4] end
local out = cjson.encode(st)
redis.call('SET', KEYS[1], out, 'KEEPTTL')
return out
`;

// Single-use redemption: only an approved code whose secret matches is
// deleted and returned; anything else is left alone.
const REDEEM_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
local st = cjson.decode(raw)
if st.secretHash ~= ARGV[1] then return false end
if st.status ~= 'approved' then return raw end
redis.call('DEL', KEYS[1])
return raw
`;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * Owner 2026-10-20 (WeChat / WhatsApp Web style): the website shows a QR
 * code, the signed-in phone scans it and approves, the website gets its own
 * session. State lives in Redis only (two minutes, single use):
 *
 * - the QR carries a public id; the browser keeps a separate poll secret
 *   (hashed here), so a stranger who photographs the QR cannot collect the
 *   tokens;
 * - only a phone session (not another browser) may approve;
 * - every step is rate limited and written to the auth journal.
 */
@Injectable()
export class QrLoginService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rateLimit: RateLimitService,
    private readonly authEvents: AuthEventService,
    private readonly auth: AuthService,
  ) {}

  private async limit(
    parts: string[],
    max: number,
    windowSec: number,
  ): Promise<void> {
    const r = await this.rateLimit.consumeFixedWindow(parts, max, windowSec);
    if (!r.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many attempts. Try again later.',
          details: { retryAfterSeconds: r.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** POST /auth/qr */
  async create(
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<QrLoginCreatedDto> {
    if (meta.ip) await this.limit(['qr-create', 'ip', meta.ip], 120, 3600);
    const qrId = randomBytes(16).toString('base64url');
    const pollSecret = randomBytes(24).toString('base64url');
    const state: QrState = {
      secretHash: sha256(pollSecret),
      status: 'pending',
      device: {
        deviceId: device.deviceId?.slice(0, 255),
        deviceName:
          device.deviceName?.slice(0, 120) ??
          browserLabel(meta.userAgent) ??
          undefined,
        platform: 'web',
        appVersion: device.appVersion?.slice(0, 50),
      },
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(
      KEY(qrId),
      JSON.stringify(state),
      'EX',
      QR_LOGIN_TTL_SEC,
    );
    const base = (
      this.config.get<string>('APP_LINK_BASE_URL') ?? 'https://lawbid.dev'
    ).replace(/\/+$/, '');
    return {
      qrId,
      pollSecret,
      qrUrl: `${base}/q/${qrId}`,
      expiresIn: QR_LOGIN_TTL_SEC,
    };
  }

  /** POST /auth/qr/poll */
  async poll(
    qrId: string,
    pollSecret: string,
    meta: RequestMeta,
  ): Promise<QrLoginPollResultDto> {
    if (meta.ip) await this.limit(['qr-poll', 'ip', meta.ip], 1800, 3600);
    const raw = (await this.redis.eval(
      REDEEM_LUA,
      1,
      KEY(qrId),
      sha256(pollSecret),
    )) as string | false | null;
    // Wrong secret and a missing code look the same.
    if (!raw) return this.result('expired');
    const st = JSON.parse(raw) as QrState;
    if (st.status !== 'approved' || !st.userId) {
      return this.result(st.status);
    }
    const tokens = await this.auth.issueQrLogin(
      st.userId,
      { ...st.device, platform: 'web' },
      { ...meta, ip: st.ip ?? meta.ip, userAgent: st.userAgent ?? undefined },
    );
    return {
      status: 'approved',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
    };
  }

  private result(status: QrStatus | 'expired'): QrLoginPollResultDto {
    return {
      status,
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresIn: null,
    };
  }

  /** The phone's session must be a phone, not another browser. */
  private async assertPhone(userId: string, sid: string): Promise<void> {
    const s = await this.prisma.session.findFirst({
      where: { user_id: userId, session_chain_id: sid, revoked_at: null },
      select: { platform: true },
    });
    if (!s || s.platform === 'web') this.notFound();
  }

  private notFound(): never {
    throw new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'This code expired. Refresh the code on the website.',
    });
  }

  /** GET /auth/qr/:qrId — the phone scanned it: show the browser. */
  async preview(
    userId: string,
    sid: string,
    qrId: string,
  ): Promise<QrLoginPreviewDto> {
    await this.limit(['qr-scan', 'user', userId], 60, 3600);
    await this.assertPhone(userId, sid);
    const raw = (await this.redis.eval(
      TRANSITION_LUA,
      1,
      KEY(qrId),
      'pending,scanned',
      'scanned',
      userId,
      userId,
    )) as string | false | null;
    if (!raw) this.notFound();
    const st = JSON.parse(raw) as QrState;
    const ttl = await this.redis.ttl(KEY(qrId));
    return {
      deviceName: st.device.deviceName ?? null,
      platform: st.device.platform ?? null,
      userAgent: st.userAgent,
      ipHint: maskIp(st.ip),
      createdAt: st.createdAt,
      expiresIn: Math.max(0, ttl),
    };
  }

  /** POST /auth/qr/:qrId/approve | reject — only by the phone that scanned. */
  async answer(
    userId: string,
    sid: string,
    qrId: string,
    approve: boolean,
    meta: RequestMeta,
  ): Promise<void> {
    await this.limit(['qr-answer', 'user', userId], 60, 3600);
    await this.assertPhone(userId, sid);
    const raw = (await this.redis.eval(
      TRANSITION_LUA,
      1,
      KEY(qrId),
      'scanned',
      approve ? 'approved' : 'rejected',
      userId,
      userId,
    )) as string | false | null;
    if (!raw) this.notFound();
    const st = JSON.parse(raw) as QrState;
    await this.authEvents.record({
      userId,
      eventType: approve
        ? AUTH_EVENT_TYPES.QR_LOGIN_APPROVED
        : AUTH_EVENT_TYPES.QR_LOGIN_REJECTED,
      success: true,
      deviceId: meta.deviceId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: {
        webDevice: st.device.deviceName ?? null,
        webIp: st.ip,
        phoneSessionId: sid,
      },
    });
  }
}

/** 203.0.113.45 → 203.0.113.x; IPv6 keeps the first two groups. */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.')) {
    const p = ip.replace(/^::ffff:/, '').split('.');
    return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : null;
  }
  const g = ip.split(':');
  return g.length > 2 ? `${g[0]}:${g[1]}::` : null;
}

/** "Chrome · macOS" from a User-Agent; null when it says nothing useful. */
export function browserLabel(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /YaBrowser/.test(userAgent)
        ? 'Yandex'
        : /(Chrome|CriOS)\//.test(userAgent)
          ? 'Chrome'
          : /(Firefox|FxiOS)\//.test(userAgent)
            ? 'Firefox'
            : /Safari\//.test(userAgent)
              ? 'Safari'
              : null;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /(iPhone|iPad|iPod)/.test(userAgent)
      ? 'iOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux|X11/.test(userAgent)
            ? 'Linux'
            : null;
  const label = [browser, os].filter(Boolean).join(' · ');
  return label || null;
}
