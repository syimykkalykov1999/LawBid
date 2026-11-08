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
  /** The device's sign-in chain (stable across token refresh) — the
   * answering phone is told apart from the others by it. */
  chainId?: string;
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
    // One VoIP token per phone (sign-in chain): an older one of the same
    // chain only doubles every ring (owner 2026-11-08).
    await this.prisma.voipToken.deleteMany({
      where: {
        user_id: userId,
        token: { not: token },
        session: { session_chain_id: sessionChainId },
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
             s.session_chain_id AS "chainId",
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
    // Owner 2026-11-08 (prod: a declined iPhone sent declines of ids the
    // server never made): one phone (sign-in chain) kept an old VoIP token
    // next to its new one and got TWO ring pushes per call; the second was
    // reported as a throw-away CallKit call, and the plugin then reported
    // the person's «Decline» with the throw-away's id. One push per chain:
    // the newest token (rows come newest first).
    const seen = new Set<string>();
    return rows
      .filter((r) => r.alive)
      .filter((r) => {
        if (!r.chainId) return true;
        if (seen.has(r.chainId)) return false;
        seen.add(r.chainId);
        return true;
      })
      .map(({ token, topic, environment, sessionId, chainId }) => ({
        token,
        topic,
        environment,
        sessionId,
        chainId,
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
   * skipped so the phone doesn't ring twice.
   *
   * Owner 2026-11-03 (an unlocked iPhone showed «НЕОТЛОЖНЫЕ · Входящий
   * звонок» next to CallKit's call banner): the FCM and the VoIP token are
   * each bound to the NEWEST session row of the sign-in chain at their own
   * registration, and every token refresh adds a row to the chain. Matched
   * by session row they rarely met, so the iPhone that rang by VoIP got the
   * time-sensitive alert too. Matched by the chain (one per signed-in
   * device), as the VoIP stop push already does. */
  async fcmTokensCoveredBy(sessionIds: string[]): Promise<string[]> {
    if (sessionIds.length === 0) return [];
    const chains = await this.prisma.session.findMany({
      where: { id: { in: sessionIds } },
      select: { session_chain_id: true },
    });
    if (chains.length === 0) return [];
    const rows = await this.prisma.pushToken.findMany({
      where: {
        platform: 'ios',
        session: {
          session_chain_id: { in: chains.map((c) => c.session_chain_id) },
        },
      },
      select: { fcm_token: true },
    });
    return rows.map((r) => r.fcm_token);
  }
}
