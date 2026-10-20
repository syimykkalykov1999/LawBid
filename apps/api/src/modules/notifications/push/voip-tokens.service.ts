import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/** At most this many iPhones get a call push per user (newest first). */
const MAX_DEVICES = 10;

export type ApnsEnvironment = 'sandbox' | 'production';

export interface VoipDevice {
  token: string;
  topic: string;
  environment: ApnsEnvironment;
  sessionId: string;
}

/**
 * Owner 2026-10-17: iPhone PushKit (VoIP) tokens — incoming calls go to
 * Apple directly. Bound to the session chain like push tokens: signing
 * out of a device stops its calls.
 */
@Injectable()
export class VoipTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    userId: string,
    sessionChainId: string,
    token: string,
    topic: string,
    environment: ApnsEnvironment,
  ): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: {
        user_id: userId,
        session_chain_id: sessionChainId,
        revoked_at: null,
      },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });
    if (!session) return;
    await this.prisma.voipToken.upsert({
      where: { token },
      create: {
        user_id: userId,
        session_id: session.id,
        token,
        topic,
        environment,
      },
      update: {
        user_id: userId,
        session_id: session.id,
        topic,
        environment,
        last_seen_at: new Date(),
      },
    });
    const stale = await this.prisma.voipToken.findMany({
      where: { user_id: userId },
      orderBy: { last_seen_at: 'desc' },
      skip: MAX_DEVICES,
      select: { id: true },
    });
    if (stale.length > 0) {
      await this.prisma.voipToken.deleteMany({
        where: { id: { in: stale.map((s) => s.id) } },
      });
    }
  }

  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.voipToken.deleteMany({
      where: { user_id: userId, token },
    });
  }

  /** Tokens whose session chain is still signed in (dead ones removed). */
  async activeDevices(userId: string): Promise<VoipDevice[]> {
    const rows = await this.prisma.$queryRaw<
      (VoipDevice & { alive: boolean })[]
    >`
      SELECT t.token AS token, t.topic AS topic,
             t.environment AS environment, t.session_id AS "sessionId",
             EXISTS (SELECT 1 FROM sessions s2
                     WHERE s2.session_chain_id = s.session_chain_id
                       AND s2.revoked_at IS NULL
                       AND s2.expires_at > now()) AS alive
      FROM voip_tokens t
      JOIN sessions s ON s.id = t.session_id
      WHERE t.user_id = ${userId}::UUID
      ORDER BY t.last_seen_at DESC
      LIMIT ${MAX_DEVICES}`;
    const dead = rows.filter((r) => !r.alive).map((r) => r.token);
    if (dead.length > 0) {
      await this.prisma.voipToken.deleteMany({
        where: { token: { in: dead } },
      });
    }
    return rows
      .filter((r) => r.alive)
      .map(({ token, topic, environment, sessionId }) => ({
        token,
        topic,
        environment,
        sessionId,
      }));
  }

  /** The device's build talks to the other APNs environment. */
  async setEnvironment(
    token: string,
    environment: ApnsEnvironment,
  ): Promise<void> {
    await this.prisma.voipToken.updateMany({
      where: { token },
      data: { environment },
    });
  }

  /** Apple said the token is gone (410 / BadDeviceToken in both envs). */
  async remove(token: string): Promise<void> {
    await this.prisma.voipToken.deleteMany({ where: { token } });
  }

  /** FCM tokens of iPhones that ring by VoIP — their FCM call push is
   * skipped so the phone doesn't ring twice. */
  async fcmTokensCoveredBy(sessionIds: string[]): Promise<string[]> {
    if (sessionIds.length === 0) return [];
    const rows = await this.prisma.pushToken.findMany({
      where: { session_id: { in: sessionIds }, platform: 'ios' },
      select: { fcm_token: true },
    });
    return rows.map((r) => r.fcm_token);
  }
}
