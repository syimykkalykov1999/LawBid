import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PrismaService } from '../../prisma/prisma.service';

/** A running call nobody has asked about for this long is over (the apps
 * send a heartbeat every ~8 s). Shared by the calls module and the group /
 * channel lists, which show a running call without importing it. */
export const CALL_SILENT_MS = 180 * 1000;

/** How many faces the «Call in progress» bar shows (Telegram: three). */
export const ONGOING_CALL_FACES = 3;

export class OngoingCallPersonDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;
}

/**
 * Owner 2026-10-21 (inbox 20e/20f, Telegram «Видеочат»): the call running in
 * a group or a channel, as its row in the list and the bar in the chat show
 * it — without ringing anybody (a channel may have thousands of people).
 */
export class OngoingCallDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  video!: boolean;

  @ApiProperty({ description: 'People in the call now.' })
  participantCount!: number;

  @ApiProperty({
    type: [OngoingCallPersonDto],
    description: 'The first few people in the call (up to 3), for faces.',
  })
  participants!: OngoingCallPersonDto[];

  @ApiProperty()
  startedAt!: Date;
}

type AvatarUrls = (
  ids: (string | null | undefined)[],
) => Promise<Map<string, { url: string | null; url256: string | null }>>;

/** Running calls of these groups / channels, by group / channel id. */
export async function ongoingCalls(
  prisma: PrismaService,
  avatarUrls: AvatarUrls,
  owner: { groupIds: string[] } | { channelIds: string[] },
): Promise<Map<string, OngoingCallDto>> {
  const out = new Map<string, OngoingCallDto>();
  const byGroup = 'groupIds' in owner;
  const ids = byGroup ? owner.groupIds : owner.channelIds;
  if (ids.length === 0) return out;
  const calls = await prisma.call.findMany({
    where: {
      ...(byGroup ? { group_id: { in: ids } } : { channel_id: { in: ids } }),
      status: 'active',
      // Silent (everybody's app gone, not swept yet): not a call to join.
      updated_at: { gt: new Date(Date.now() - CALL_SILENT_MS) },
    },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      group_id: true,
      channel_id: true,
      video: true,
      created_at: true,
      participants: {
        where: { status: 'joined' },
        orderBy: { joined_at: 'asc' },
        select: {
          user: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              avatar_file_id: true,
            },
          },
        },
      },
    },
  });
  const live = calls.filter((c) => c.participants.length > 0);
  const faces = live.flatMap((c) =>
    c.participants.slice(0, ONGOING_CALL_FACES).map((p) => p.user),
  );
  const avatars = await avatarUrls(faces.map((u) => u.avatar_file_id));
  for (const c of live) {
    const key = byGroup ? c.group_id : c.channel_id;
    if (!key || out.has(key)) continue;
    out.set(key, {
      id: c.id,
      video: c.video,
      participantCount: c.participants.length,
      participants: c.participants
        .slice(0, ONGOING_CALL_FACES)
        .map(({ user: u }) => {
          const a = u.avatar_file_id ? avatars.get(u.avatar_file_id) : null;
          return {
            userId: u.id,
            displayName:
              [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
              null,
            avatarUrl: a?.url256 ?? a?.url ?? null,
          };
        }),
      startedAt: c.created_at,
    });
  }
  return out;
}
