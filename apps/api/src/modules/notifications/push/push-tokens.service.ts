import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/** At most this many devices get a push per user (newest first). */
const MAX_DEVICES = 10;

/**
 * docs/05 §9.5 push tokens: bound to the device's session chain (the JWT
 * `sid`), so logging out of a device stops its pushes. Registration moves
 * a token to the current user/session (a device changing hands).
 */
@Injectable()
export class PushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    userId: string,
    sessionChainId: string,
    token: string,
    platform: string,
    localReminders = false,
    chatStyle = false,
    actorStyle = false,
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
    await this.prisma.pushToken.upsert({
      where: { fcm_token: token },
      create: {
        user_id: userId,
        session_id: session.id,
        fcm_token: token,
        platform,
        local_reminders: localReminders,
        chat_style: chatStyle,
        actor_style: actorStyle,
      },
      update: {
        user_id: userId,
        session_id: session.id,
        platform,
        local_reminders: localReminders,
        chat_style: chatStyle,
        actor_style: actorStyle,
        last_seen_at: new Date(),
      },
    });
    // Keep the newest MAX_DEVICES per user (security review: no unbounded
    // token rows from one account).
    const stale = await this.prisma.pushToken.findMany({
      where: { user_id: userId },
      orderBy: { last_seen_at: 'desc' },
      skip: MAX_DEVICES,
      select: { id: true },
    });
    if (stale.length > 0) {
      await this.prisma.pushToken.deleteMany({
        where: { id: { in: stale.map((s) => s.id) } },
      });
    }
  }

  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({
      where: { user_id: userId, fcm_token: token },
    });
  }

  /** Tokens whose session chain is still signed in. Rotation revokes the
   * old session row but keeps the chain alive, so liveness is checked on
   * the chain; tokens of a chain fully signed out are removed. */
  async activeTokens(userId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<
      { token: string; alive: boolean }[]
    >`
      SELECT t.fcm_token AS token,
             EXISTS (SELECT 1 FROM sessions s2
                     WHERE s2.session_chain_id = s.session_chain_id
                       AND s2.revoked_at IS NULL
                       AND s2.expires_at > now()) AS alive
      FROM push_tokens t
      JOIN sessions s ON s.id = t.session_id
      WHERE t.user_id = ${userId}::UUID
      ORDER BY t.last_seen_at DESC
      LIMIT ${MAX_DEVICES}`;
    const dead = rows.filter((r) => !r.alive).map((r) => r.token);
    if (dead.length > 0) {
      await this.prisma.pushToken.deleteMany({
        where: { fcm_token: { in: dead } },
      });
    }
    return rows.filter((r) => r.alive).map((r) => r.token);
  }

  /** Browser tokens: a browser push must show something, so silent
   * pushes (call_ended) skip them. */
  async webTokens(userId: string): Promise<string[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: { user_id: userId, platform: 'web' },
      select: { fcm_token: true },
    });
    return rows.map((r) => r.fcm_token);
  }

  /** Android devices whose app keeps the planner reminders itself and
   * shows the reminder push under its own id (data-only message). An iPhone
   * always gets the visible push too: iOS does not wake a swiped-away app
   * for a silent one, so a task made elsewhere would otherwise be missed. */
  async localReminderTokens(userId: string): Promise<string[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: {
        user_id: userId,
        platform: { in: ['android', 'ios'] },
        local_reminders: true,
      },
      select: { fcm_token: true },
    });
    return rows.map((r) => r.fcm_token);
  }

  /** Owner 2026-10-22: Android devices whose app draws chat notifications
   * itself (WhatsApp-style, with the sender's photo) from a data-only push.
   * Older app versions never set it and keep the normal alert. */
  async chatStyleTokens(userId: string): Promise<string[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: { user_id: userId, platform: 'android', chat_style: true },
      select: { fcm_token: true },
    });
    return rows.map((r) => r.fcm_token);
  }

  /** Owner 2026-10-26: Android devices whose app draws notifications with
   * a person (their round photo) itself from a data-only push. */
  async actorStyleTokens(userId: string): Promise<string[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: { user_id: userId, platform: 'android', actor_style: true },
      select: { fcm_token: true },
    });
    return rows.map((r) => r.fcm_token);
  }

  /** Owner 2026-10-26: the account and signed-in session of a device, by
   * its FCM token (a notification button acts only while the device is
   * still signed in — push-actions.service). */
  async deviceSession(
    token: string,
  ): Promise<{ userId: string; sessionChainId: string } | null> {
    // Two queries by id, no join (shard-ready step 0: PushToken and Session
    // are different families).
    const row = await this.prisma.pushToken.findUnique({
      where: { fcm_token: token },
      select: { user_id: true, session_id: true },
    });
    if (!row) return null;
    const own = await this.prisma.session.findUnique({
      where: { id: row.session_id },
      select: { session_chain_id: true },
    });
    if (!own) return null;
    const live = await this.prisma.session.findFirst({
      where: {
        user_id: row.user_id,
        session_chain_id: own.session_chain_id,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      select: { id: true },
    });
    return live
      ? { userId: row.user_id, sessionChainId: own.session_chain_id }
      : null;
  }

  /** The reminders an iPhone has armed itself (it reports after each
   * change); a replace, newest list wins. */
  async setArmedReminders(
    userId: string,
    token: string,
    ids: string[],
  ): Promise<void> {
    await this.prisma.pushToken.updateMany({
      where: { user_id: userId, fcm_token: token },
      data: { armed_reminders: ids },
    });
  }

  /** token → armed reminder keys, for the user's iPhones. */
  async armedReminders(userId: string): Promise<Map<string, Set<string>>> {
    const rows = await this.prisma.pushToken.findMany({
      where: { user_id: userId, platform: 'ios' },
      select: { fcm_token: true, armed_reminders: true },
    });
    return new Map(rows.map((r) => [r.fcm_token, new Set(r.armed_reminders)]));
  }

  /** FCM said UNREGISTERED / invalid (§9.5). */
  async remove(token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { fcm_token: token } });
  }
}
