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
      },
      update: {
        user_id: userId,
        session_id: session.id,
        platform,
        last_seen_at: new Date(),
      },
    });
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

  /** FCM said UNREGISTERED / invalid (§9.5). */
  async remove(token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { fcm_token: token } });
  }
}
