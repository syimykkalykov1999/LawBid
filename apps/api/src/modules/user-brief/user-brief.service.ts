import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { activeClientBadgeIds } from '../client-badge/client-badge.util';
import { FilesService } from '../files/files.service';
import type { UserBriefDto } from './user-brief.dto';

/** The same name / avatar / check rules as a post's author, for any list
 * of people in one batch (no N+1). */
@Injectable()
export class UserBriefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async many(ids: readonly string[]): Promise<Map<string, UserBriefDto>> {
    const out = new Map<string, UserBriefDto>();
    const unique = [...new Set(ids)];
    if (unique.length === 0) return out;
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        role: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        client_profile: { select: { username: true } },
        attorney_profile: { select: { username: true, trust_badge: true } },
      },
    });
    const [avatars, gold] = await Promise.all([
      this.files.avatarUrlsMany(users.map((u) => u.avatar_file_id)),
      activeClientBadgeIds(
        this.prisma,
        users.filter((u) => u.role === 'client').map((u) => u.id),
      ),
    ]);
    for (const u of users) {
      const client = u.role === 'client';
      out.set(u.id, {
        id: u.id,
        role: client ? 'client' : 'attorney',
        username: client
          ? (u.client_profile?.username ?? '')
          : (u.attorney_profile?.username ?? ''),
        firstName: u.first_name,
        lastName: u.last_name,
        avatarUrl: u.avatar_file_id
          ? (avatars.get(u.avatar_file_id)?.url256 ?? null)
          : null,
        verifiedBadge: client
          ? gold.has(u.id)
          : (u.attorney_profile?.trust_badge ?? false),
      });
    }
    return out;
  }
}
