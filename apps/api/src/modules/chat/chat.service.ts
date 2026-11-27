import {
  FeatureFlagsService,
  GROUPS_FLAG,
} from '../feature-flags/feature-flags.public';
import {
  TextLimitsService,
  textLimit,
} from '../../common/app-settings/text-limits.service';
import { BidTeamService } from '../firms/bid-team.service';
import { readsAreSplit } from '../../sharding/split-reads';
import { forEachDatabase } from '../../sharding/for-each-database';
import { StickersService } from '../stickers/stickers.service';
import type { StickerDto } from '../stickers/stickers.dto';
import {
  SharedPostCardsService,
  type SharedPostCardDto,
} from '../posts/shared-post-cards.service';
import { postNotFound } from '../posts/posts.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  Inject,
} from '@nestjs/common';
import { ClientFraudService } from '../client-fraud/client-fraud.service';
import {
  Prisma,
  type ChatPairKind,
  type Conversation,
  type Message,
  type SavedChatKind,
} from '../../generated/prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  createdBefore,
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import {
  allWordsSql,
  escapeLike,
  nameKeys,
  nameMatchSql,
  nameStrictSql,
  typedWords,
} from '../../common/search/name-match.sql';
import { SYNC_TOO_OLD_ERROR } from '../../common/sync/sync.util';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { PrismaService } from '../../prisma/prisma.service';
import { BoostActions } from '../promotions/boost-actions.service';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { shardContext } from '../../sharding/shard-context';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BlocksService } from '../blocks/blocks.service';
import { caseWorkOngoing } from '../blocks/block-guard';
import { PrivacySettingsService } from '../privacy-settings/privacy-settings.service';
import { PresenceService } from '../presence/presence.service';
import { maskContactInfo } from '../cases/domain/contact-detector';
import { isImageMime } from '../files/files.policy';
import { FilesService, type UnscannedChatFile } from '../files/files.service';
import {
  type FileScanListener,
  SCAN_WAIT_TTL_SEC,
  scanWaitKey,
} from '../files/files.public';
import { BadgesService, UNREAD_CAP } from '../notifications/badges.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import {
  type CallLogDto,
  type ChatAttachmentDto,
  type ConversationDto,
  type ConversationPage,
  type ContactCardDto,
  type MessageDto,
  type MessagePage,
  type ReactionDto,
  type ReplyPreviewDto,
  type SendMessageDto,
  type VoiceNoteDto,
  ChatFolderCountsDto,
  type ChatStorageDto,
  type ConversationFolderName,
  OrganizeConversationDto,
} from './chat.dto';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { E2eeService } from './e2ee/e2ee.service';
import { sealedPreviewMap } from '../notifications/push-preview';
import { fileNameAad } from '../../common/secrets/field-aad';
import { MessageSearchIndex } from '../../common/secrets/message-search-index';
import { searchTokenRows, writeSearchTokenRows } from './chat-search-tokens';
import { recordSentMessage } from './chat-send-bookkeeping';
import { loadMessageExtras, type MessageExtras } from './chat-message-extras';
import { messagesByPairs } from './messages-by-pairs';
import { expiresAtFor, notExpired } from './disappearing';
import { touchClientActive } from '../cases/cases.public';
import { HeavyHittersService } from '../../common/heavy-hitters/heavy-hitters.service';
import {
  type ForwardContent,
  forwardName,
  forwardNotAllowed,
  forwardPartId,
  unsupportedInTarget,
} from '../../common/forward/forward-content';

const CONVERSATIONS_PAGE = 20;
const MESSAGES_PAGE = 30;
const CATCH_UP_MAX = 100;
/** A shared place is an address, not a letter. */
const PLACE_MAX_CHARS = 200;
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"]+/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A file name for a forwarded post photo (photo.jpg / photo.png…). */
function photoName(mime: string | null | undefined): string {
  const ext = (mime ?? '').split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  return `photo.${ext}`;
}

/** ~80 characters of [text] around the first typed word. */
function snippetAround(text: string, words: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const low = flat.toLowerCase().replace(/ё/g, 'е');
  const at = Math.min(
    ...words.map((w) => {
      const i = low.indexOf(w);
      return i < 0 ? Infinity : i;
    }),
  );
  const start = Number.isFinite(at) ? Math.max(0, at - 25) : 0;
  const cut = flat.slice(start, start + 80);
  return `${start > 0 ? '…' : ''}${cut}${start + 80 < flat.length ? '…' : ''}`;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.CONVERSATION_NOT_FOUND,
    message: 'Conversation not found.',
  });
}

function closed(): ConflictException {
  return new ConflictException({
    code: ErrorCode.CONVERSATION_CLOSED,
    message: 'This chat is closed.',
  });
}

function fullName(first: string | null, last: string | null): string | null {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || null;
}

/** Newer-than on the (created_at, id) message order. */
function isAfter(
  a: { created_at: Date; id: string },
  b: { created_at: Date; id: string },
): boolean {
  const t = a.created_at.getTime() - b.created_at.getTime();
  return t > 0 || (t === 0 && a.id > b.id);
}

/**
 * docs/05 §8 (stage 5.7) chats. Conversations are created only from a case
 * (docs/04 §9: "Написать клиенту", bid acceptance); here: list, messages,
 * sending (idempotent on clientMessageId, contact masking until
 * contacts_unlocked, closed → read only, attorney needs an active
 * subscription/trial), read receipts and mute. Realtime only delivers —
 * every event is re-derivable from these REST reads (§8.5).
 */
/** S1-3: sent messages whose live event / badge / push may still be owed
 * (ZSET: score = send time, member = which message). */
const EFFECTS_PENDING_KEY = 'rt:fx:pending';
/** A request that is alive finishes in seconds; later than this it died. */
const EFFECTS_GRACE_MS = 120_000;
const EFFECTS_SWEEP_BATCH = 100;

@Injectable()
export class ChatService implements FileScanListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: UsageLimitsService,
    private readonly subscriptions: SubscriptionAccessService,
    private readonly files: FilesService,
    private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationsService,
    private readonly badges: BadgesService,
    private readonly blocks: BlocksService,
    private readonly presence: PresenceService,
    private readonly stickers: StickersService,
    // Scaling TZ point 11: message texts encrypted at rest.
    @Optional() private readonly cipher?: MessageBodyCipher,
    // Owner 2026-10-05 (docs/CLIENT_FRAUD.md): a restricted account cannot
    // write to attorneys until staff look.
    @Optional() private readonly fraud?: ClientFraudService,
    // Owner 2026-10-15: the chat message limit is the admin's.
    @Optional() private readonly textLimits?: TextLimitsService,
    // Owner 2026-10-20: "who can write to me first" (Settings → Privacy).
    @Optional() private readonly privacy?: PrivacySettingsService,
    // Owner 2026-10-21 (Instagram «Поделиться»): posts sent as cards.
    @Optional() private readonly postCards?: SharedPostCardsService,
    // S1-3: the "effects still owed" list (see [markEffectsPending]).
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    // BUG-1 (package N-12b): blind word index of the sealed texts.
    @Optional() private readonly searchIndex?: MessageSearchIndex,
    // WP-G: who sends the most messages (admin «Масштаб»). Last, so the
    // positional constructor in specs keeps its order.
    @Optional() private readonly heavy?: HeavyHittersService,
    // Owner 2026-10-27: a new chat counts for the author's boost paid per action.
    @Optional() private readonly boostActions?: BoostActions,
    // Owner 2026-11-16 (row 183): with «Группы» off the folder counters
    // leave group invitations and archived groups out.
    @Optional() private readonly flags?: FeatureFlagsService,
    // Firms audit 16.11 (PR-5): the firm's team on a bid works in its chat.
    @Optional() readonly team?: BidTeamService,
    // Item 25: end-to-end encrypted chats (the MLS Delivery Service).
    @Optional() private readonly e2ee?: E2eeService,
  ) {}

  /** The admin switch «Группы» (a missing row reads as on, as in GroupsService). */
  private async groupsOn(): Promise<boolean> {
    return !this.flags || (await this.flags.isEnabled(GROUPS_FLAG, true));
  }

  /**
   * Owner 2026-10-01: the folder filter. "all" = everything but requests
   * sent to me; primary / general by my choice or automatically (case
   * chats are Primary); waiting = marked "waiting for my answer".
   */
  private folderWhere(
    me: string,
    folder: ConversationFolderName,
  ): Prisma.ConversationWhereInput[] {
    // Owner 2026-10-02: chats I removed from my list stay out of every folder.
    // Owner 2026-10-20: archived ones live only in the «archive» folder.
    const hiddenOut: Prisma.ConversationWhereInput = {
      NOT: {
        participants: { some: { user_id: me, hidden_at: { not: null } } },
      },
    };
    if (folder === 'archive') {
      return [
        hiddenOut,
        {
          participants: { some: { user_id: me, archived_at: { not: null } } },
        },
      ];
    }
    return [
      ...this.folderWhereInner(me, folder),
      hiddenOut,
      {
        NOT: {
          participants: { some: { user_id: me, archived_at: { not: null } } },
        },
      },
    ];
  }

  private folderWhereInner(
    me: string,
    folder: ConversationFolderName,
  ): Prisma.ConversationWhereInput[] {
    // OQ-043: requests sent to me wait in "Requests".
    if (folder === 'requests') {
      return [{ request_status: 'pending', requested_by: { not: me } }];
    }
    const notRequest: Prisma.ConversationWhereInput = {
      OR: [
        { request_status: { in: ['none', 'accepted'] } },
        { requested_by: me },
      ],
    };
    const mine = (w: Prisma.ConversationParticipantWhereInput) => ({
      participants: { some: { user_id: me, ...w } },
    });
    switch (folder) {
      case 'primary':
        return [
          notRequest,
          {
            OR: [
              mine({ folder: 'primary' }),
              { case_id: { not: null }, ...mine({ folder: null }) },
            ],
          },
        ];
      case 'general':
        return [
          notRequest,
          {
            OR: [
              mine({ folder: 'general' }),
              { case_id: null, ...mine({ folder: null }) },
            ],
          },
        ];
      case 'waiting':
        return [notRequest, mine({ waiting_since: { not: null } })];
      // Owner 2026-10-21: «Cases» — only the chats tied to a case.
      case 'cases':
        return [notRequest, { case_id: { not: null } }];
      default:
        return [notRequest];
    }
  }

  /** The chats that are the caller's: their own two-sided ones and (Firms
   * audit 16.11, PR-5) the case chats of the firm bids they joined. */
  private async mineWhere(
    user: RequestUser,
  ): Promise<Prisma.ConversationWhereInput> {
    const own: Prisma.ConversationWhereInput[] = [
      { client_id: user.sub },
      { attorney_id: user.sub },
    ];
    const teamChats =
      user.role === 'attorney' && this.team
        ? await this.team.chatIdsOf(user.sub)
        : [];
    return {
      OR: teamChats.length ? [...own, { id: { in: teamChats } }] : own,
    };
  }

  /** Whether the caller works in any firm bid's chat (PR-5). */
  async hasTeamChats(user: RequestUser): Promise<boolean> {
    if (user.role !== 'attorney' || !this.team) return false;
    return (await this.team.chatIdsOf(user.sub)).length > 0;
  }

  async list(
    user: RequestUser,
    cursor?: string,
    updatedSince?: string,
    folder: ConversationFolderName = 'all',
    q?: string,
  ): Promise<ConversationPage> {
    if (!this.sideOf(user)) return { items: [], nextCursor: null };
    const c = cursor ? decodeCursor(cursor) : undefined;
    const mine = await this.mineWhere(user);
    const filters = this.folderWhere(user.sub, folder);
    // Owner 2026-10-18: search — only the chats the typed text found.
    const found = q ? await this.searchHits(user.sub, q) : null;
    if (found) filters.push({ id: { in: [...found.keys()] } });
    // Pinned chats lead the first page; the paged list skips them.
    const firstPage = !c && !updatedSince;
    const pinnedFilter: Prisma.ConversationWhereInput = {
      participants: { some: { user_id: user.sub, pinned_at: { not: null } } },
    };
    const pinned = firstPage
      ? await this.prisma.conversation.findMany({
          where: {
            AND: [mine, ...filters, pinnedFilter],
            last_message_at: { not: null },
          },
          take: 50,
        })
      : [];
    const pinnedAt = new Map(
      (
        await this.prisma.conversationParticipant.findMany({
          where: {
            user_id: user.sub,
            conversation_id: { in: pinned.map((p) => p.id) },
          },
          select: { conversation_id: true, pinned_at: true },
        })
      ).map((p) => [p.conversation_id, p.pinned_at?.getTime() ?? 0]),
    );
    pinned.sort(
      (a, b) => (pinnedAt.get(b.id) ?? 0) - (pinnedAt.get(a.id) ?? 0),
    );
    const rows = await this.prisma.conversation.findMany({
      where: {
        AND: [
          mine,
          ...filters,
          ...(updatedSince ? [this.changedSince(updatedSince)] : []),
          ...(updatedSince ? [] : [{ NOT: pinnedFilter }]),
        ],
        // A chat appears in the list once it has a message (§8.1).
        last_message_at: { not: null },
        ...(c
          ? {
              OR: [
                { last_message_at: { lt: c.createdAt } },
                { last_message_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ last_message_at: 'desc' }, { id: 'desc' }],
      take: CONVERSATIONS_PAGE + 1,
    });
    const page = rows.slice(0, CONVERSATIONS_PAGE);
    const last = page[page.length - 1];
    const items = await this.present([...pinned, ...page], user.sub);
    if (found) {
      for (const it of items) it.matchedMessage = found.get(it.id) ?? null;
    }
    return {
      items,
      nextCursor:
        rows.length > CONVERSATIONS_PAGE && last?.last_message_at
          ? encodeCursor({ createdAt: last.last_message_at, id: last.id })
          : null,
    };
  }

  /**
   * Owner 2026-10-22 (load audit finding 2, Telegram getDifference): the
   * app catches up after a socket gap with `updatedSince` instead of
   * reloading its list. A chat changed when its row did (a new message, a
   * status / request change) or when I read it on another device (my
   * participant row's `last_read_at`, which the row itself never sees).
   */
  private changedSince(since: string): Prisma.ConversationWhereInput {
    const at = new Date(since);
    return {
      OR: [
        { updated_at: { gte: at } },
        // Verify 17.11: either side's read mark (my ticks turn blue when the
        // other side reads), not only mine.
        { participants: { some: { last_read_at: { gte: at } } } },
      ],
    };
  }

  /**
   * BUG-1 (package N-12b): which messages of chat `c` hold every typed word.
   * Sealed bodies (MESSAGE_ENC_KEYS) are matched through the blind index
   * `message_search_tokens` — per word one of its tokens must be there
   * (intersection: COUNT(DISTINCT word) = words), read by the primary key
   * (conversation_id, token, …). Without the key nothing in a sealed body
   * can match (FALSE; names and titles still do). Plain bodies (local dev)
   * keep the LIKE.
   */
  private async messageTextMatch(
    q: string,
    words: string[],
  ): Promise<Prisma.Sql> {
    if (!this.searchIndex?.sealed && !this.cipher?.enabled) {
      return allWordsSql(Prisma.sql`m.body_display`, words);
    }
    if (!this.searchIndex?.enabled) return Prisma.sql`FALSE`;
    const t = this.searchIndex.queryTokens(
      q,
      await this.searchIndex.prefixMode(),
    );
    if (t.words === 0) return Prisma.sql`FALSE`;
    return Prisma.sql`m.id IN (
            SELECT st.message_id FROM message_search_tokens st
            JOIN unnest(${t.hex}::TEXT[], ${t.word}::INT[]) AS qt(h, w)
              ON st.token = decode(qt.h, 'hex')
            WHERE st.conversation_id = c.id
            GROUP BY st.message_id
            HAVING COUNT(DISTINCT qt.w) = ${t.words})`;
  }

  /**
   * Owner 2026-10-18: chat search. The chats of [me] where the OTHER person's
   * name (any alphabet / typo / word order) or @username, the case title, or
   * a (not deleted) message contains the typed words. Id → snippet of the
   * newest message hit, null when the name / title matched. A client whose
   * identity the attorney does not see yet («Клиент по кейсу») cannot be
   * found by name.
   */
  private async searchHits(
    me: string,
    q: string,
  ): Promise<Map<string, string | null>> {
    const words = typedWords(q);
    if (!words.length) return new Map();
    const handle = `${escapeLike(q.trim().replace(/^@+/, '').toLowerCase())}%`;
    const textMatch = await this.messageTextMatch(q, words);
    const keys = await nameKeys(this.prisma, q);
    const rows = readsAreSplit(this.prisma)
      ? await this.searchHitsSplit(me, words, handle, textMatch, keys)
      : await this.prisma.$queryRaw<
          {
            id: string;
            body: string | null;
            msg_id: string | null;
            by_meta: boolean;
          }[]
        >`
      SELECT id, body, msg_id,
             -- Owner 2026-10-28: a typo-only name match («sima» ~ «Syimyk»)
             -- counts only when no chat's name matched strongly.
             (by_strong OR (by_loose AND NOT bool_or(by_strong) OVER ())) AS by_meta
      FROM (SELECT c.id::TEXT AS id, msg.body AS body, msg.msg_id AS msg_id,
             COALESCE((NOT hidden.v AND (${nameStrictSql(keys, 'o')}
                 OR coalesce(ap.username_lower, cp.username_lower) LIKE ${handle}))
              OR (cs.title IS NOT NULL AND ${allWordsSql(Prisma.sql`cs.title`, words)}), FALSE) AS by_strong,
             COALESCE(NOT hidden.v AND ${nameMatchSql(keys, 'o')}, FALSE) AS by_loose
      FROM conversations c
      JOIN users o ON o.id = CASE WHEN c.client_id = ${me}::UUID
                                  THEN c.attorney_id ELSE c.client_id END
      LEFT JOIN attorney_profiles ap ON ap.user_id = o.id
      LEFT JOIN client_profiles cp ON cp.user_id = o.id
      LEFT JOIN cases cs ON cs.id = c.case_id
      CROSS JOIN LATERAL (SELECT (o.role::TEXT <> 'attorney'
                                  AND NOT c.contacts_unlocked
                                  AND c.case_id IS NOT NULL) AS v) hidden
      LEFT JOIN LATERAL (
        SELECT m.body_display AS body, m.id::TEXT AS msg_id FROM messages m
        WHERE m.conversation_id = c.id
          AND m.deleted_at IS NULL
          AND m.type IN ('text', 'attachment')
          AND ${textMatch}
        ORDER BY m.created_at DESC LIMIT 1) msg ON TRUE
      WHERE (c.client_id = ${me}::UUID OR c.attorney_id = ${me}::UUID)
        AND c.last_message_at IS NOT NULL) t
      WHERE t.by_strong OR t.by_loose OR t.body IS NOT NULL
      LIMIT 2000`;
    const out = new Map<string, string | null>();
    for (const r of rows) {
      if (r.by_meta) out.set(r.id, null);
      else if (r.body !== null) {
        out.set(
          r.id,
          snippetAround(
            this.cipher?.open(r.body, r.msg_id ?? '') ?? r.body,
            words,
          ),
        );
      }
    }
    return out;
  }

  /** Two databases (SHARDING_READY step 8): the same rules as the one-
   * database query of [searchHits] — conversations, cases and messages (case
   * family) on every database, the other person's name / @username and role
   * (global) on the primary, put together here. */
  private async searchHitsSplit(
    me: string,
    words: string[],
    handle: string,
    textMatch: Prisma.Sql,
    keys: Awaited<ReturnType<typeof nameKeys>>,
  ): Promise<
    {
      id: string;
      body: string | null;
      msg_id: string | null;
      by_meta: boolean;
    }[]
  > {
    const convs = (
      await forEachDatabase(
        this.prisma,
        () =>
          this.prisma.$queryRaw<
            {
              id: string;
              other: string;
              locked: boolean;
              by_title: boolean;
              body: string | null;
              msg_id: string | null;
            }[]
          >`
          SELECT c.id::TEXT AS id,
                 (CASE WHEN c.client_id = ${me}::UUID THEN c.attorney_id
                       ELSE c.client_id END)::TEXT AS other,
                 (NOT c.contacts_unlocked AND c.case_id IS NOT NULL) AS locked,
                 COALESCE(cs.title IS NOT NULL AND ${allWordsSql(Prisma.sql`cs.title`, words)}, FALSE) AS by_title,
                 msg.body, msg.msg_id
          FROM conversations c
          LEFT JOIN cases cs ON cs.id = c.case_id
          LEFT JOIN LATERAL (
            SELECT m.body_display AS body, m.id::TEXT AS msg_id FROM messages m
            WHERE m.conversation_id = c.id
              AND m.deleted_at IS NULL
              AND m.type IN ('text', 'attachment')
              AND ${textMatch}
            ORDER BY m.created_at DESC LIMIT 1) msg ON TRUE
          WHERE (c.client_id = ${me}::UUID OR c.attorney_id = ${me}::UUID)
            AND c.last_message_at IS NOT NULL`,
      )
    ).flat();
    if (convs.length === 0) return [];
    const others = [...new Set(convs.map((c) => c.other))];
    const people = await shardContext.runOnPrimary(
      () => this.prisma.$queryRaw<
        { id: string; attorney: boolean; strict: boolean; loose: boolean }[]
      >`
        SELECT o.id::TEXT AS id, (o.role::TEXT = 'attorney') AS attorney,
               COALESCE(${nameStrictSql(keys, 'o')}
                 OR coalesce(ap.username_lower, cp.username_lower) LIKE ${handle}, FALSE) AS strict,
               COALESCE(${nameMatchSql(keys, 'o')}, FALSE) AS loose
        FROM users o
        LEFT JOIN attorney_profiles ap ON ap.user_id = o.id
        LEFT JOIN client_profiles cp ON cp.user_id = o.id
        WHERE o.id = ANY(${others}::UUID[])`,
    );
    const byId = new Map(people.map((p) => [p.id, p]));
    const marked = convs.map((c) => {
      const p = byId.get(c.other);
      const hidden = !!p && !p.attorney && c.locked;
      return {
        ...c,
        strong: (!hidden && !!p?.strict) || c.by_title,
        loose: !hidden && !!p?.loose,
      };
    });
    const anyStrong = marked.some((m) => m.strong);
    return marked
      .filter((m) => m.strong || m.loose || m.body !== null)
      .slice(0, 2000)
      .map((m) => ({
        id: m.id,
        body: m.body,
        msg_id: m.msg_id,
        by_meta: m.strong || (m.loose && !anyStrong),
      }));
  }

  /** Owner 2026-10-01: folder, "waiting for my answer", note, pin. */
  async organize(
    user: RequestUser,
    id: string,
    dto: OrganizeConversationDto,
  ): Promise<ConversationDto> {
    await this.load(user, id);
    const current = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_user_id: { conversation_id: id, user_id: user.sub },
      },
      select: { waiting_since: true, pinned_at: true },
    });
    const data: Prisma.ConversationParticipantUncheckedUpdateInput = {
      ...(dto.folder !== undefined
        ? { folder: dto.folder === 'auto' ? null : dto.folder }
        : {}),
      ...(dto.waiting !== undefined
        ? {
            waiting_since: dto.waiting
              ? (current?.waiting_since ?? new Date())
              : null,
          }
        : {}),
      ...(dto.note !== undefined ? { note: dto.note ? dto.note : null } : {}),
      ...(dto.hidden !== undefined
        ? { hidden_at: dto.hidden ? new Date() : null }
        : {}),
      ...(dto.archived !== undefined
        ? { archived_at: dto.archived ? new Date() : null }
        : {}),
      ...(dto.pinned !== undefined
        ? {
            pinned_at: dto.pinned ? (current?.pinned_at ?? new Date()) : null,
          }
        : {}),
      // Row 110: my own unread mark (Telegram «Mark as unread»).
      ...(dto.unread !== undefined
        ? { marked_unread_at: dto.unread ? new Date() : null }
        : {}),
    };
    await this.prisma.conversationParticipant.upsert({
      where: {
        conversation_id_user_id: { conversation_id: id, user_id: user.sub },
      },
      create: {
        ...(data as Prisma.ConversationParticipantUncheckedCreateInput),
        conversation_id: id,
        user_id: user.sub,
      },
      update: data,
    });
    // A hidden chat leaves the unread badge (and comes back when unhidden).
    // The write is done: a failing badge refresh (Redis / socket blip) must
    // not turn into a 500 «something went wrong» on a chat that did move.
    if (
      dto.hidden !== undefined ||
      dto.archived !== undefined ||
      dto.unread !== undefined
    )
      await this.badges.chatsChanged(user.sub).catch(() => undefined);
    return this.get(user, id);
  }

  /** Owner 2026-10-01: badges of the Waiting and Requests folders. */
  async folderCounts(user: RequestUser): Promise<ChatFolderCountsDto> {
    if (!this.sideOf(user)) {
      return { waiting: 0, requests: 0, cases: 0, archived: 0 };
    }
    const groupsOn = await this.groupsOn();
    const [waiting, requests, casesAwaiting, archivedChats, archivedGroups] =
      await Promise.all([
        this.prisma.conversation.count({
          where: {
            AND: [
              { OR: [{ client_id: user.sub }, { attorney_id: user.sub }] },
              ...this.folderWhere(user.sub, 'waiting'),
            ],
          },
        }),
        this.requestsCount(user),
        this.casesAwaitingCount(user.sub),
        this.prisma.conversation.count({
          where: {
            AND: [
              { OR: [{ client_id: user.sub }, { attorney_id: user.sub }] },
              ...this.folderWhere(user.sub, 'archive'),
              { last_message_at: { not: null } },
            ],
          },
        }),
        groupsOn
          ? this.prisma.chatGroupMember.count({
              where: {
                user_id: user.sub,
                left_at: null,
                hidden_at: null,
                archived_at: { not: null },
                group: { deleted_at: null, last_message_at: { not: null } },
              },
            })
          : 0,
      ]);
    return {
      waiting,
      requests: requests.count,
      cases: casesAwaiting,
      archived: archivedChats + archivedGroups,
    };
  }

  async get(user: RequestUser, id: string): Promise<ConversationDto> {
    const conv = await this.openForWorkingPair(await this.load(user, id));
    const [dto] = await this.present([conv], user.sub);
    return dto;
  }

  /**
   * Owner 24.11 (Upwork / Fiverr order chats, Telegram «one person = one
   * chat»): a client and an attorney with an accepted case between them
   * (its chat's contacts unlocked) already work together — every chat of
   * the two is a full chat (files, photos, voice, calls), not a message
   * request. Since R-404 the Chats row of such a person opens the direct
   * chat, which used to start as a request with contacts locked.
   */
  private async worksTogether(pair: {
    client_id: string;
    attorney_id: string;
  }): Promise<boolean> {
    const accepted = await this.prisma.conversation.findFirst({
      where: {
        client_id: pair.client_id,
        attorney_id: pair.attorney_id,
        case_id: { not: null },
        contacts_unlocked: true,
      },
      select: { id: true },
    });
    return accepted !== null;
  }

  /** A pending direct request of a pair that works together (see
   * [worksTogether]) — opened before or after the bid was accepted —
   * becomes a full chat the moment either side opens or writes to it. */
  private async openForWorkingPair(conv: Conversation): Promise<Conversation> {
    if (
      conv.case_id !== null ||
      conv.pair_kind !== 'attorney_client' ||
      conv.contacts_unlocked ||
      conv.request_status !== 'pending' ||
      !(await this.worksTogether(conv))
    ) {
      return conv;
    }
    const opened = await this.prisma.conversation.update({
      where: { id: conv.id },
      data: { request_status: 'accepted', contacts_unlocked: true },
    });
    // It leaves «Requests» for the main list on both sides.
    this.realtime.toUsers(
      [conv.client_id, conv.attorney_id],
      'conversation:update',
      { conversationId: conv.id },
    );
    return opened;
  }

  /** Owner 2026-10-05: counts and bytes of the files in a chat. */
  async storage(user: RequestUser, id: string): Promise<ChatStorageDto> {
    await this.load(user, id);
    const [rows, usage] = await Promise.all([
      this.prisma.$queryRaw<{ kind: string; n: bigint }[]>`
        SELECT CASE
                 WHEN m.type = 'voice' THEN 'voice'
                 WHEN f.mime LIKE 'image/%' THEN 'photo'
                 ELSE 'document'
               END AS kind,
               count(*)::INT8 AS n
        FROM messages m JOIN files f ON f.id = m.file_id
        WHERE m.conversation_id = ${id}::UUID
          AND m.deleted_at IS NULL
          AND f.deleted_at IS NULL
        GROUP BY 1`,
      this.files.chatUsage(id),
    ]);
    const count = (k: string) =>
      Number(rows.find((r) => r.kind === k)?.n ?? 0n);
    return {
      photos: count('photo'),
      documents: count('document'),
      voice: count('voice'),
      usedBytes: usage.usedBytes,
      quotaBytes: usage.quotaBytes,
    };
  }

  async messages(
    user: RequestUser,
    id: string,
    cursor?: string,
    afterId?: string,
    only?: 'attachment',
    q?: string,
  ): Promise<MessagePage> {
    const conv = await this.load(user, id);
    if (q?.trim()) return this.searchInChat(user, conv, q, cursor);
    if (afterId) {
      // Verify 17.11: the phone's newest message only marks a position — one
      // removed by moderation or a disappearing timer since is still that
      // position (the soft-delete filter hid it: 404 on every reconnect).
      const anchor = await this.prisma.message.findFirst({
        where: withDeleted({ id: afterId, conversation_id: id }),
        select: { id: true, created_at: true },
      });
      if (!anchor) throw notFound();
      const seen = {
        OR: [
          { created_at: { lt: anchor.created_at } },
          { created_at: anchor.created_at, id: { lte: anchor.id } },
        ],
      };
      const [rows, changed] = await Promise.all([
        this.prisma.message.findMany({
          where: {
            conversation_id: id,
            deleted_at: null,
            hidden_for: { none: { user_id: user.sub } },
            AND: [notExpired(), { NOT: seen }],
          },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          take: CATCH_UP_MAX + 1,
        }),
        // Audit 17.11 (problem 4): edits and deletes for everyone of
        // messages the phone already holds (edited / revoked after the
        // newest message it has) — before, only the 5-minute socket event
        // log carried them. Index messages_conv_updated_idx
        // (prisma/concurrent).
        this.prisma.message.findMany({
          where: {
            conversation_id: id,
            deleted_at: null,
            updated_at: { gt: anchor.created_at },
            hidden_for: { none: { user_id: user.sub } },
            AND: [
              notExpired(),
              seen,
              {
                OR: [
                  { edited_at: { gt: anchor.created_at } },
                  { revoked_at: { gt: anchor.created_at } },
                  // Verify 17.11: «voice played» and reactions added, changed
                  // or removed (they never reached a phone that was
                  // offline). Not updated_at alone: the key re-encryption
                  // job touches every row and would make every catch-up 409.
                  { listened_at: { gt: anchor.created_at } },
                  { reactions_changed_at: { gt: anchor.created_at } },
                ],
              },
            ],
          },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          take: CATCH_UP_MAX + 1,
        }),
      ]);
      // Audit 17.11 (problem 4): more than the catch-up gives → 409
      // SYNC_TOO_OLD, the app drops its copy and reads the first page (as
      // groups and Telegram's getDifference «too long»). Before, the first
      // 100 came back and the rest was silently lost.
      if (rows.length > CATCH_UP_MAX || changed.length > CATCH_UP_MAX) {
        throw new ConflictException({
          ...SYNC_TOO_OLD_ERROR,
          message: 'Too many messages since afterId — reload the page.',
          details: { field: 'afterId', max: CATCH_UP_MAX },
        });
      }
      const all = [...changed, ...rows];
      const urls = await this.mediaLinks(all);
      return {
        items: all.map((m) => this.toMessage(m, user.sub, conv, urls)),
        nextCursor: null,
      };
    }
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.message.findMany({
      where: {
        conversation_id: id,
        deleted_at: null,
        hidden_for: { none: { user_id: user.sub } },
        ...(only ? { type: only } : {}),
        AND: [
          notExpired(),
          ...(c ? [createdBefore({ t: c.createdAt, id: c.id })] : []),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: MESSAGES_PAGE + 1,
    });
    const page = rows.slice(0, MESSAGES_PAGE);
    const last = page[page.length - 1];
    const urls = await this.mediaLinks(page);
    return {
      items: page.map((m) => this.toMessage(m, user.sub, conv, urls)),
      nextCursor:
        rows.length > MESSAGES_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /**
   * Row 110 (Telegram 🔍 in a chat, WhatsApp «Search»): the text messages of
   * one chat that hold every typed word, newest first, a page at a time.
   * The words are matched the same way as the chats list search
   * ([messageTextMatch]: the blind index for sealed bodies), then the page
   * is read with the same visibility rules as [messages] (not deleted, not
   * hidden for me, not expired).
   */
  private async searchInChat(
    user: RequestUser,
    conv: Conversation,
    q: string,
    cursor?: string,
  ): Promise<MessagePage> {
    const words = typedWords(q);
    if (!words.length) return { items: [], nextCursor: null };
    const textMatch = await this.messageTextMatch(q, words);
    const c = cursor ? decodeCursor(cursor) : undefined;
    const hits = await this.prisma.$queryRaw<
      { id: string; created_at: Date }[]
    >`
      SELECT m.id::TEXT AS id, m.created_at FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = ${conv.id}::UUID
        AND m.deleted_at IS NULL
        AND m.type IN ('text', 'attachment')
        AND ${textMatch}
        ${
          c
            ? Prisma.sql`AND (m.created_at, m.id) < (${c.createdAt}, ${c.id}::UUID)`
            : Prisma.empty
        }
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${MESSAGES_PAGE + 1}`;
    if (!hits.length) return { items: [], nextCursor: null };
    const page = hits.slice(0, MESSAGES_PAGE);
    const rows = await this.prisma.message.findMany({
      where: {
        conversation_id: conv.id,
        id: { in: page.map((h) => h.id) },
        deleted_at: null,
        hidden_for: { none: { user_id: user.sub } },
        AND: [notExpired()],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    // The cursor follows the last hit, so a page whose hits were all
    // hidden for me still leads on.
    const last = page[page.length - 1];
    const urls = await this.mediaLinks(rows);
    return {
      items: rows.map((m) => this.toMessage(m, user.sub, conv, urls)),
      nextCursor:
        hits.length > MESSAGES_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** POST /conversations/:id/messages (§8.4). */
  async send(
    user: RequestUser,
    id: string,
    dto: SendMessageDto,
  ): Promise<MessageDto> {
    if (!dto.forwardFromId) return this.sendContent(user, id, dto);
    await this.limits.consume('forward', user.sub);
    // A retry of a forward must not copy the file twice.
    const existing = await this.findOwn(id, user.sub, dto.clientMessageId);
    if (existing) {
      return this.toMessage(
        existing,
        user.sub,
        undefined,
        await this.mediaLinks([existing]),
      );
    }
    return this.sendContent(user, id, await this.forwardContent(user, dto));
  }

  /**
   * Owner 2026-10-20: the content of the message to forward as a send
   * request — text, sticker, or a voice note / file copied as a new file row
   * over the same stored object (FilesService.copyForUser: no upload, same
   * type, size and quota rules).
   */
  private async forwardContent(
    user: RequestUser,
    dto: SendMessageDto,
  ): Promise<SendMessageDto & { forwardedFromName?: string }> {
    const content = await this.forwardSource(user, dto.forwardFromId!);
    return this.forwardDto(user, content, dto.clientMessageId, dto.replyToId);
  }

  /**
   * Owner 2026-10-21 (Telegram «Переслать»): a message of a chat I take
   * part in as forward content — 404 when I cannot read it, 403
   * FORWARD_NOT_ALLOWED for a disappearing message (it stays where it was
   * sent). A message that was already forwarded keeps the first author.
   */
  async forwardSource(user: RequestUser, id: string): Promise<ForwardContent> {
    const src = await this.prisma.message.findFirst({
      where: {
        id,
        deleted_at: null,
        revoked_at: null,
        hidden_for: { none: { user_id: user.sub } },
      },
    });
    if (!src) throw notFound();
    // Only from a chat the forwarder takes part in.
    await this.load(user, src.conversation_id);
    // Item 25: an end-to-end encrypted message is forwarded by the app
    // (it decrypts and sends a new one); the server cannot read it.
    if (src.type === 'system' || src.type === 'call' || src.type === 'mls') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This message cannot be forwarded.',
        details: { field: 'forwardFromId' },
      });
    }
    if (src.expires_at) throw forwardNotAllowed();
    const text = this.openBody(src.body_display, src.id);
    // Telegram: "Forwarded from <name>". A message that was already
    // forwarded keeps the first author's name.
    const author = src.sender_id
      ? await this.prisma.user.findUnique({
          where: { id: src.sender_id },
          select: { first_name: true, last_name: true },
        })
      : null;
    const fromName =
      src.forwarded_from_name ??
      forwardName(author?.first_name, author?.last_name);
    switch (src.type) {
      case 'sticker':
        return {
          kind: 'sticker',
          text: '',
          stickerId: src.sticker_id ?? undefined,
          fromName,
        };
      case 'voice':
      case 'attachment': {
        if (!src.file_id) throw notFound();
        if (src.type === 'voice') {
          return {
            kind: 'voice',
            text: '',
            fileId: src.file_id,
            durationMs: src.duration_ms ?? 0,
            waveform: src.waveform,
            fromName,
          };
        }
        const file = await this.prisma.file.findUnique({
          where: { id: src.file_id },
          select: { mime: true },
        });
        return {
          kind: 'attachment',
          text,
          fileId: src.file_id,
          fileName: this.openFileName(src.file_name, src.id) ?? 'file',
          mime: file?.mime,
          fromName,
        };
      }
      // Owner 2026-10-21: a shared attorney card stays a card (it used to
      // arrive as a text with the attorney's id).
      case 'contact':
        return { kind: 'contact', text: '', contactUserId: text, fromName };
      case 'place':
        return { kind: 'place', text, fromName };
      case 'gift':
        return { kind: 'gift', text: '', fromName };
      // Owner 2026-10-21: a shared feed post — a card in a chat, its link
      // in a group or a channel.
      case 'post':
        return {
          kind: 'text',
          text: `${(process.env.WEB_APP_URL ?? 'https://lawbid.dev').replace(/\/+$/, '')}/post/${text}`,
          postId: text,
          fromName,
        };
      default:
        return { kind: 'text', text, fromName };
    }
  }

  /**
   * Owner 2026-10-21: [content] forwarded into chat [id] through the normal
   * send (the same checks, sockets and pushes). A channel post with photos
   * makes one message per photo (the caption on the first, an album in the
   * app). A retry with the same [clientMessageId] copies nothing again.
   * [silent]: no push (only the last message of a batch rings).
   */
  async sendForwarded(
    user: RequestUser,
    id: string,
    clientMessageId: string,
    content: ForwardContent,
    opts: { silent?: boolean } = {},
  ): Promise<MessageDto> {
    const photos = content.kind === 'post' ? (content.photoFileIds ?? []) : [];
    const parts: ForwardContent[] =
      photos.length > 0
        ? photos.map((fileId, i) => ({
            kind: 'attachment',
            text:
              i === 0
                ? [content.text, content.postLink].filter(Boolean).join('\n')
                : '',
            fileId,
            fromName: content.fromName,
          }))
        : [content];
    let first: MessageDto | null = null;
    for (const [i, part] of parts.entries()) {
      const cmid = forwardPartId(clientMessageId, i);
      const existing = await this.findOwn(id, user.sub, cmid);
      const sent = existing
        ? this.toMessage(
            existing,
            user.sub,
            undefined,
            await this.mediaLinks([existing]),
          )
        : await this.sendContent(
            user,
            id,
            await this.forwardDto(user, part, cmid),
            { silent: opts.silent || i < parts.length - 1 },
          );
      first ??= sent;
    }
    return first!;
  }

  /** [content] as a send request; a file is copied for [user] first. */
  private async forwardDto(
    user: RequestUser,
    content: ForwardContent,
    clientMessageId: string,
    replyToId?: string,
  ): Promise<SendMessageDto & { forwardedFromName?: string }> {
    const base = {
      clientMessageId,
      forwarded: !content.own,
      replyToId,
      forwardedFromName: content.fromName ?? undefined,
    };
    // Owner 2026-10-21: a shared feed post stays a card in a chat.
    if (content.postId)
      return { ...base, type: 'post', postId: content.postId };
    switch (content.kind) {
      case 'sticker':
        return { ...base, type: 'sticker', stickerId: content.stickerId };
      case 'contact':
        return {
          ...base,
          type: 'contact',
          contactUserId: content.contactUserId,
        };
      case 'place':
        return { ...base, type: 'place', body: content.text };
      // A gift is paid once, by its giver.
      case 'gift':
        throw unsupportedInTarget();
      case 'voice':
        return {
          ...base,
          type: 'voice',
          fileId: (
            await this.files.copyForUser(
              content.fileId!,
              user.sub,
              'chat_voice',
            )
          ).id,
          durationMs: content.durationMs ?? 0,
          waveform: content.waveform,
        };
      case 'attachment': {
        const copy = await this.files.copyForUser(
          content.fileId!,
          user.sub,
          'chat_attachment',
        );
        return {
          ...base,
          type: 'attachment',
          body: content.text,
          fileId: copy.id,
          fileName: content.fileName ?? photoName(copy.mime),
        };
      }
      default:
        return {
          ...base,
          body: [content.text, content.postLink].filter(Boolean).join('\n'),
        };
    }
  }

  private async sendContent(
    user: RequestUser,
    id: string,
    dto: SendMessageDto & { forwardedFromName?: string },
    opts: { silent?: boolean } = {},
  ): Promise<MessageDto> {
    const voice = dto.type === 'voice';
    const attachment = dto.type === 'attachment';
    // Owner 2026-10-01: a sticker carries no text.
    const sticker = dto.type === 'sticker';
    // Owner 2026-10-20: a shared attorney card (the body is the attorney's
    // id) and a place (the body is the address).
    const contact = dto.type === 'contact';
    const place = dto.type === 'place';
    // Owner 2026-10-21 (Instagram «Поделиться»): a post card (the body is
    // the post's id; the app draws the card, the note goes as a text).
    const post = dto.type === 'post';
    // Item 25 (E2EE): an MLS application message; no text reaches us.
    const mls = dto.type === 'mls';
    const body =
      voice || sticker || mls
        ? ''
        : contact
          ? (dto.contactUserId ?? '')
          : post
            ? (dto.postId ?? '')
            : (dto.body ?? '').trim();
    await this.fraud?.assertNotRestricted(user.sub);
    // OQ-048: an assistant sends documents/photos only with "files".
    if (
      attachment &&
      user.assistant &&
      !user.assistant.duties.includes('files')
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'The attorney has not given you this duty.',
        details: { duty: 'files' },
      });
    }
    if (attachment) {
      if (!dto.fileId || !dto.fileName?.trim()) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'An attachment needs fileId and fileName.',
          details: { fields: ['fileId', 'fileName'] },
        });
      }
    } else if (sticker) {
      if (!dto.stickerId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A sticker message needs stickerId.',
          details: { field: 'stickerId' },
        });
      }
    } else if (contact) {
      if (!dto.contactUserId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A contact card needs contactUserId.',
          details: { field: 'contactUserId' },
        });
      }
      if (!(await this.sharableAttorney(user.sub, dto.contactUserId))) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Only an attorney profile can be shared.',
          details: { field: 'contactUserId' },
        });
      }
    } else if (post) {
      if (!dto.postId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A post card needs postId.',
          details: { field: 'postId' },
        });
      }
      if (!(await this.sharablePost(user.sub, dto.postId))) {
        throw postNotFound();
      }
    } else if (mls) {
      if (!dto.ciphertext || dto.mlsEpoch === undefined || !dto.mlsDeviceId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'An MLS message needs ciphertext, mlsEpoch and mlsDeviceId.',
          details: { fields: ['ciphertext', 'mlsEpoch', 'mlsDeviceId'] },
        });
      }
    } else if (voice) {
      if (!dto.fileId || dto.durationMs === undefined) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A voice message needs fileId and durationMs.',
          details: { fields: ['fileId', 'durationMs'] },
        });
      }
    } else if (!body) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Empty message.',
        details: { field: 'body' },
      });
    }
    if (place && [...body].length > PLACE_MAX_CHARS) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `An address is at most ${PLACE_MAX_CHARS} characters.`,
        details: { field: 'body', max: PLACE_MAX_CHARS },
      });
    }
    const maxChars = await textLimit(
      this.textLimits,
      'limits.chat_message_chars',
    );
    if ([...body].length > maxChars) {
      throw new BadRequestException({
        code: ErrorCode.MESSAGE_TOO_LONG,
        message: `A message is at most ${maxChars} characters.`,
        details: { max: maxChars },
      });
    }
    const conv = await this.openForWorkingPair(await this.load(user, id));
    // A retry of an already stored message: same answer, no new row and
    // no rate-limit charge.
    const existing = await this.findOwn(id, user.sub, dto.clientMessageId);
    if (existing) {
      return this.toMessage(
        existing,
        user.sub,
        undefined,
        await this.mediaLinks([existing]),
      );
    }
    // Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §3.1): an MLS
    // message only into this chat's group in its current epoch; plain words
    // are refused once the chat is end-to-end encrypted.
    const ciphertext = mls ? Buffer.from(dto.ciphertext!, 'base64') : null;
    const frankingTag =
      mls && dto.frankingTag ? Buffer.from(dto.frankingTag, 'base64') : null;
    if (mls) {
      if (!this.e2ee) throw notFound();
      await this.e2ee.assertMlsSend(user, conv, {
        deviceId: dto.mlsDeviceId!,
        epoch: dto.mlsEpoch!,
        ciphertext: new Uint8Array(ciphertext!),
      });
      // Message franking (Messenger): every MLS message carries its
      // 32-byte tag, so a report of it can be checked and its receivers
      // check it too (a message whose tag does not match is dropped).
      if (!frankingTag || frankingTag.length !== 32) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'An MLS message needs its 32-byte franking tag.',
          details: { field: 'frankingTag' },
        });
      }
      // Item 25 (plan §5): an encrypted file goes as ciphertext the phone
      // uploaded (chat_e2ee), its key inside the MLS message.
      if (dto.fileId) {
        await this.files.assertAttachable(user.sub, dto.fileId, ['chat_e2ee']);
        const used = await this.prisma.message.findFirst({
          where: { file_id: dto.fileId },
          select: { id: true },
        });
        if (used) {
          throw new ConflictException({
            code: ErrorCode.FILE_NOT_ATTACHABLE,
            message: 'This file was already sent.',
          });
        }
      }
    } else {
      await this.e2ee?.assertPlainAllowed(conv, dto.type ?? 'text');
    }

    await this.limits.consume('message', user.sub);
    if (conv.status === 'closed') throw closed();
    // OQ-043: a message request — the recipient's reply accepts it; a
    // declined request takes no more. Owner 2026-10-17: no cap on how many
    // messages the requester sends meanwhile.
    let requestFirst = false;
    let acceptRequest = false;
    if (conv.request_status === 'pending') {
      if (conv.requested_by === user.sub) {
        const sent = await this.prisma.message.count({
          where: { conversation_id: id, sender_id: user.sub, deleted_at: null },
        });
        requestFirst = sent === 0;
      } else {
        acceptRequest = true;
      }
    } else if (
      conv.request_status === 'declined' &&
      conv.requested_by === user.sub
    ) {
      throw new ForbiddenException({
        code: ErrorCode.MESSAGE_REQUEST_DECLINED,
        message: 'This person does not accept your messages.',
      });
    }
    await this.assertNotBlockedIn(user.sub, conv);
    // Only an attorney writing to a client pays (owner 2026-10-17) — the
    // firm's team on the bid too (PR-5), each on their own subscription.
    if (
      conv.pair_kind === 'attorney_client' &&
      user.sub !== conv.client_id &&
      !(await this.subscriptions.isActive(user.sub))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.SUBSCRIPTION_REQUIRED,
        message: 'Renew your subscription to send messages.',
      });
    }
    // Owner 2026-09-30: replying accepts the request — a full chat, contacts
    // open, calls allowed. Audit 2026-10-02: only after the block and
    // subscription checks passed (a refused reply used to unlock contacts).
    if (acceptRequest) {
      await this.prisma.conversation.update({
        where: { id },
        data: { request_status: 'accepted', contacts_unlocked: true },
      });
      conv.request_status = 'accepted';
      conv.contacts_unlocked = true;
    }
    // OQ-047: photos and documents once the bid is accepted (contacts
    // unlocked) — in case chats and accepted direct chats alike.
    if (attachment && !conv.contacts_unlocked) {
      throw new ForbiddenException({
        code: ErrorCode.CHAT_ATTACHMENTS_LOCKED,
        message: 'Files can be sent once the bid is accepted.',
      });
    }
    let scanPending = false;
    if (attachment) {
      // M3 (owner 25.11): the message goes while the scan still runs.
      scanPending =
        (
          await this.files.assertAttachable(
            user.sub,
            dto.fileId!,
            ['chat_attachment'],
            undefined,
            { pending: true },
          )
        )?.scan_status === 'pending';
      const used = await this.prisma.message.findFirst({
        where: { file_id: dto.fileId },
        select: { id: true },
      });
      if (used) {
        throw new ConflictException({
          code: ErrorCode.FILE_NOT_ATTACHABLE,
          message: 'This file was already sent.',
        });
      }
      // Owner 2026-10-05: a chat holds at most storage.chat_quota_mb.
      await this.files.assertChatRoom(id, dto.fileId!);
    }
    if (sticker) await this.stickers.useForMessage(user.sub, dto.stickerId!);
    if (voice) {
      scanPending =
        (
          await this.files.assertAttachable(
            user.sub,
            dto.fileId!,
            ['chat_voice'],
            undefined,
            { pending: true },
          )
        )?.scan_status === 'pending';
      // One note, one message: a file is never re-sent elsewhere.
      const used = await this.prisma.message.findFirst({
        where: { file_id: dto.fileId },
        select: { id: true },
      });
      if (used) {
        throw new ConflictException({
          code: ErrorCode.FILE_NOT_ATTACHABLE,
          message: 'This voice note was already sent.',
        });
      }
    }

    // Owner 2026-10-20: a reply quotes a message of this same chat.
    let replyToId: string | null = null;
    if (dto.replyToId) {
      const quoted = await this.prisma.message.findFirst({
        where: { id: dto.replyToId, conversation_id: id },
        select: { id: true },
      });
      if (!quoted) throw notFound();
      replyToId = quoted.id;
    }
    // S1-3: a crash between the commit and the live event / badge / push
    // used to lose them for good. The entry below is the safety net: the
    // sweep (`chat.redeliver`) finishes whatever is still listed 2 minutes
    // later; the request removes it once its own effects are done.
    const pending = await this.markEffectsPending(
      id,
      user.sub,
      dto.clientMessageId,
      opts.silent === true,
      requestFirst,
    );
    // BUG-1 (package N-12b): read before the transaction (a settings read).
    const searchPrefixes = this.searchIndex?.enabled
      ? await this.searchIndex.prefixMode()
      : false;
    // Load test 2026-10-28 (docs/perf/LOCAL_LOAD_TEST_2026-10-28.md, #4):
    // everything that does not need the conversation row lock is prepared
    // BEFORE the transaction — the message id, the sealed bodies and file
    // name (the latter may read a setting), the masking and the blind search
    // tokens. The `FOR UPDATE` used to be held (and the pooled connection
    // kept "idle in transaction", up to 350 ms under load) while Node did
    // this work. Inside, only the lock, the checks it guards and the writes.
    // The masking depends on contacts_unlocked: prepared for the value read
    // just now, redone inside in the rare case the locked row says otherwise.
    const messageId = randomUUID();
    const messageType = voice
      ? 'voice'
      : attachment
        ? 'attachment'
        : sticker
          ? 'sticker'
          : contact
            ? 'contact'
            : place
              ? 'place'
              : post
                ? 'post'
                : mls
                  ? 'mls'
                  : 'text';
    // S3-5: the attachment's original name is sealed like the body.
    const fileName = attachment ? cleanFileName(dto.fileName!) : null;
    const storedFileName =
      fileName !== null && this.cipher
        ? await this.cipher.sealMetadata(fileName, fileNameAad(messageId))
        : fileName;
    const bodyOriginal = this.seal(body, messageId);
    const prepare = (unlocked: boolean) => {
      const masked =
        voice || contact || post || mls || unlocked
          ? { text: body, masked: false }
          : maskContactInfo(body);
      return {
        unlocked,
        masked,
        bodyDisplay: this.seal(masked.text, messageId),
        // BUG-1: the words of the shown text, as blind tokens.
        tokens: searchTokenRows(
          this.searchIndex,
          { id: messageId, conversation_id: id, type: messageType },
          masked.text,
          searchPrefixes,
        ),
      };
    };
    const prepared = prepare(conv.contacts_unlocked);
    let message: Message;
    try {
      message = await withTxRetry(
        this.prisma,
        async (tx) => {
          // Serializes with the file-04 transactions that close the chat or
          // unlock contacts.
          // Row 69 (KE 123): shard_id is read here and given to the message
          // insert, so the shard extension does not look the conversation up
          // again (it would be a second query on this transaction).
          const [locked] = await tx.$queryRaw<
            {
              status: string;
              contacts_unlocked: boolean;
              disappear_after_s: number | null;
              shard_id: number;
            }[]
          >`SELECT status, contacts_unlocked, disappear_after_s, shard_id FROM conversations
            WHERE id = ${id}::UUID FOR UPDATE`;
          if (!locked || locked.status === 'closed') throw closed();
          if (attachment && !locked.contacts_unlocked) {
            throw new ForbiddenException({
              code: ErrorCode.CHAT_ATTACHMENTS_LOCKED,
              message: 'Files can be sent once the bid is accepted.',
            });
          }
          // Pack B (25.11, ROUND2 #20): one file, one message. Two sends of
          // the same file at once (two chats, two devices) both passed the
          // check before this transaction; the file row's lock makes the
          // second wait for the first and then see its message (read
          // committed: every statement reads what is committed by then).
          // The same send retried (same clientMessageId) goes on to the
          // insert and its unique key, which answers with the first one.
          if ((attachment || voice) && dto.fileId) {
            const [held] = await tx.$queryRaw<{ scan_status: string }[]>`
              SELECT scan_status FROM files
              WHERE id = ${dto.fileId}::UUID FOR NO KEY UPDATE`;
            // M3: the check may have ended since the read above (this lock
            // holds its end until the message is stored).
            scanPending = held?.scan_status === 'pending';
            if (
              held &&
              held.scan_status !== 'clean' &&
              held.scan_status !== 'pending'
            ) {
              throw new ConflictException({
                code: ErrorCode.FILE_NOT_ATTACHABLE,
                message: 'This file cannot be attached.',
                details: { scanStatus: held.scan_status },
              });
            }
            const taken = await tx.message.findFirst({
              where: { file_id: dto.fileId },
              select: {
                conversation_id: true,
                sender_id: true,
                client_message_id: true,
              },
            });
            if (
              taken &&
              !(
                taken.conversation_id === id &&
                taken.sender_id === user.sub &&
                taken.client_message_id === dto.clientMessageId
              )
            ) {
              throw new ConflictException({
                code: ErrorCode.FILE_NOT_ATTACHABLE,
                message: 'This file was already sent.',
              });
            }
          }
          const p =
            prepared.unlocked === locked.contacts_unlocked
              ? prepared
              : prepare(locked.contacts_unlocked);
          // Audit #6: the id was chosen above, the sealed bodies are bound to it.
          const m = await tx.message.create({
            data: {
              id: messageId,
              conversation_id: id,
              shard_id: locked.shard_id,
              sender_id: user.sub,
              sent_by_membership_id: user.assistant?.membershipId ?? null,
              sent_by_name: user.assistant?.name.slice(0, 80) ?? null,
              type: messageType,
              body_original: bodyOriginal,
              body_display: p.bodyDisplay,
              contact_masked: p.masked.masked,
              client_message_id: dto.clientMessageId,
              reply_to_id: replyToId,
              // Owner 2026-10-21: disappearing messages.
              expires_at: expiresAtFor(locked.disappear_after_s),
              forwarded: dto.forwarded === true,
              forwarded_from_name: dto.forwardedFromName ?? null,
              ...(ciphertext
                ? {
                    ciphertext,
                    mls_epoch: dto.mlsEpoch ?? null,
                    franking_tag: frankingTag,
                    file_id: dto.fileId ?? null,
                  }
                : {}),
              ...(voice
                ? {
                    file_id: dto.fileId,
                    duration_ms: dto.durationMs,
                    waveform: dto.waveform ?? [],
                  }
                : attachment
                  ? {
                      file_id: dto.fileId,
                      file_name: storedFileName,
                    }
                  : sticker
                    ? { sticker_id: dto.stickerId }
                    : {}),
            },
          });
          // BUG-1: the blind tokens (prepared above) in the same transaction
          // (a message is never searchable-less or vice versa).
          await writeSearchTokenRows(tx, p.tokens);
          await recordSentMessage(
            tx,
            { conversationId: id, messageId: m.id, createdAt: m.created_at },
            user.sub,
          );
          return m;
        },
        { isolation: 'readCommitted' as const, op: 'chat.send' },
      );
    } catch (error) {
      // Nothing was stored (or a retry's own request delivers): no effects owed.
      await this.clearEffectsPending(pending);
      // A concurrent retry with the same clientMessageId won the insert.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.findOwn(id, user.sub, dto.clientMessageId);
        if (again) {
          return this.toMessage(
            again,
            user.sub,
            undefined,
            await this.mediaLinks([again]),
          );
        }
      }
      throw error;
    }

    // OQ-054: the client writing in their case's chat is their own action
    // on that case (the attorney writing never is).
    if (conv.case_id && user.sub === conv.client_id) {
      await touchClientActive(this.prisma, conv.case_id, user.sub);
    }
    this.heavy?.message(user.sub, conv.case_id);
    // M3: the scan's end finds this message (before the effects read the
    // file's state, so no end of the check falls between the two).
    if (scanPending && message.file_id) {
      await this.markScanWait(message.file_id, id, message.id);
    }
    const urls = await this.deliverEffects(conv, message, user.sub, {
      silent: opts.silent === true,
      requestFirst,
      // M12: the sealed push previews of an end-to-end encrypted message.
      sealed: mls ? sealedPreviewMap(dto.pushPreviews) : undefined,
    });
    await this.clearEffectsPending(pending);
    return this.toMessage(message, user.sub, undefined, urls);
  }

  /**
   * POST /conversations/:id/messages/:messageId/listened (OQ-040): the
   * recipient played a voice note — the sender's dot turns off. Only the
   * first play counts; the sender's own plays never do.
   */
  async listened(
    user: RequestUser,
    id: string,
    messageId: string,
  ): Promise<MessageDto> {
    const conv = await this.load(user, id);
    const m = await this.prisma.message.findFirst({
      where: { id: messageId, conversation_id: id, deleted_at: null },
    });
    if (!m || m.type !== 'voice') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Voice message not found.',
      });
    }
    let row = m;
    if (m.sender_id !== user.sub && !m.listened_at) {
      row = await this.prisma.message.update({
        where: {
          id_conversation_id: { id: m.id, conversation_id: m.conversation_id },
        },
        data: { listened_at: new Date() },
      });
      if (m.sender_id) {
        this.realtime.toUsers([m.sender_id], 'message:listened', {
          conversationId: id,
          messageId: m.id,
        });
      }
    }
    return this.toMessage(row, user.sub, conv, await this.mediaLinks([row]));
  }

  /**
   * OQ-041: a message written by the server on someone's behalf (a call
   * in the chat log) — to both members over realtime, like a sent one.
   * [unreadFor] also gets a badge bump (a missed call).
   */
  async announce(m: Message, unreadFor?: string): Promise<void> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: m.conversation_id },
    });
    if (!conv) return;
    await this.prisma.conversationParticipant.updateMany({
      where: { conversation_id: m.conversation_id, hidden_at: { not: null } },
      data: { hidden_at: null },
    });
    const team = (await this.team?.teamOfChat(conv)) ?? [];
    for (const uid of [conv.client_id, conv.attorney_id, ...team]) {
      this.realtime.toUsers([uid], 'message:new', {
        message: this.toMessage(m, uid, conv),
      });
    }
    if (unreadFor) await this.badges.messageArrived(unreadFor);
  }

  /**
   * POST /conversations/direct (OQ-043): the "Message" button on a
   * profile — the one direct chat of a pair, created if new. Owner
   * 2026-10-17: anyone writes to anyone, like Instagram — straight to the
   * main list when the recipient follows the caller, otherwise a request.
   * Hidden from lists until its first message.
   */
  async startDirect(
    user: RequestUser,
    otherUserId: string,
  ): Promise<ConversationDto> {
    const other = await this.prisma.user.findFirst({
      where: { id: otherUserId, deleted_at: null, status: 'active' },
      select: { id: true, role: true },
    });
    if (!other) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found.',
      });
    }
    const pair = directPair(user.sub, user.role, other.id, other.role);
    if (!pair) {
      throw new ConflictException({
        code: ErrorCode.DIRECT_CHAT_NOT_ALLOWED,
        message: 'Direct chats are between clients and attorneys.',
      });
    }
    await this.blocks.assertNotBlocked(user.sub, other.id);
    const existing = await this.prisma.conversation.findFirst({
      where: { ...pair, case_id: null },
    });
    if (existing) return this.get(user, existing.id);
    // Owner 24.11: a pair working on an accepted case is already connected.
    const working =
      pair.pair_kind === 'attorney_client' && (await this.worksTogether(pair));
    // Owner 2026-10-20: a first message needs the person's permission.
    if (!working) {
      await this.privacy?.assertAllowed(user.sub, other.id, 'message');
    }
    const followsMe = await this.prisma.follow.findUnique({
      where: {
        follower_id_followee_id: {
          follower_id: other.id,
          followee_id: user.sub,
        },
      },
      select: { follower_id: true },
    });
    let conv: Conversation;
    try {
      conv = await this.prisma.conversation.create({
        data: {
          ...pair,
          status: 'active',
          contacts_unlocked: working || followsMe !== null,
          request_status: working || followsMe ? 'accepted' : 'pending',
          requested_by: user.sub,
          participants: {
            create: [
              { user_id: pair.attorney_id },
              { user_id: pair.client_id },
            ],
          },
        },
      });
    } catch (error) {
      // A double tap: the other request created it first.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.prisma.conversation.findFirstOrThrow({
          where: { ...pair, case_id: null },
        });
        return this.get(user, again.id);
      }
      throw error;
    }
    this.boostActions?.report(user.sub, { ownerId: other.id }, 'message');
    const [dto] = await this.present([conv], user.sub);
    return dto;
  }

  /** GET /conversations/requests/count (OQ-043): requests waiting for me. */
  /**
   * Owner 2026-10-21: case chats waiting for my answer — the last message
   * is the other side's (a system line or a deleted message does not count).
   */
  private async casesAwaitingCount(me: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n
      FROM conversations c
      JOIN conversation_participants cp
        ON cp.conversation_id = c.id AND cp.user_id = ${me}::UUID
      WHERE (c.client_id = ${me}::UUID OR c.attorney_id = ${me}::UUID)
        AND c.case_id IS NOT NULL
        AND cp.hidden_at IS NULL AND cp.archived_at IS NULL
        AND (c.request_status IN ('none', 'accepted')
             OR c.requested_by = ${me}::UUID)
        AND (SELECT m.sender_id FROM messages m
             WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
             ORDER BY m.created_at DESC, m.id DESC LIMIT 1)
            IS DISTINCT FROM ${me}::UUID
        AND (SELECT m.sender_id FROM messages m
             WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
             ORDER BY m.created_at DESC, m.id DESC LIMIT 1) IS NOT NULL`;
    return Number(rows[0]?.n ?? 0);
  }

  async requestsCount(user: RequestUser): Promise<{ count: number }> {
    const [chats, invites] = await Promise.all([
      this.prisma.conversation.count({
        where: {
          OR: [{ client_id: user.sub }, { attorney_id: user.sub }],
          request_status: 'pending',
          requested_by: { not: user.sub },
          last_message_at: { not: null },
        },
      }),
      // Owner 2026-10-21: group invitations wait in Requests too
      // (row 183: not while «Группы» is off).
      this.groupsOn().then((on) =>
        on
          ? this.prisma.chatGroupInvite.count({
              where: {
                invitee_id: user.sub,
                status: 'pending',
                group: { deleted_at: null },
              },
            })
          : 0,
      ),
    ]);
    return { count: chats + invites };
  }

  /** POST /conversations/:id/request/accept | decline (OQ-043). */
  async answerRequest(
    user: RequestUser,
    id: string,
    accept: boolean,
  ): Promise<ConversationDto> {
    const conv = await this.load(user, id);
    if (conv.request_status !== 'pending' || conv.requested_by === user.sub) {
      const [dto] = await this.present([conv], user.sub);
      return dto;
    }
    // Audit 2026-10-01: a request from someone blocked either way can be
    // declined, not accepted (accepting unlocks contacts and calls).
    if (accept && conv.requested_by) {
      await this.blocks.assertNotBlocked(user.sub, conv.requested_by);
    }
    const updated = await this.prisma.conversation.update({
      where: { id },
      // Owner 2026-09-30: accepted = a full chat (contacts, calls).
      data: accept
        ? { request_status: 'accepted', contacts_unlocked: true }
        : { request_status: 'declined' },
    });
    // Audit 2026-10-02: the requester learns about a decline too.
    if (conv.requested_by) {
      this.realtime.toUsers([conv.requested_by], 'conversation:update', {
        conversationId: id,
      });
    }
    await this.badges.chatsChanged(user.sub);
    const [dto] = await this.present([updated], user.sub);
    return dto;
  }

  /** POST /conversations/:id/read (§8.4): only ever moves forward. */
  async read(
    user: RequestUser,
    id: string,
    lastReadMessageId: string,
  ): Promise<{ lastReadMessageId: string | null }> {
    const conv = await this.load(user, id);
    const target = await this.prisma.message.findFirst({
      where: { id: lastReadMessageId, conversation_id: id },
      select: { id: true, created_at: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Message not found.',
      });
    }
    const result = await withTxRetry(this.prisma, async (tx) => {
      const me = await tx.conversationParticipant.findUniqueOrThrow({
        where: {
          conversation_id_user_id: { conversation_id: id, user_id: user.sub },
        },
        select: {
          last_read_message_id: true,
          last_delivered_message_id: true,
          marked_unread_at: true,
        },
      });
      const current = me.last_read_message_id
        ? await tx.message.findUnique({
            where: {
              id_conversation_id: {
                id: me.last_read_message_id,
                conversation_id: id,
              },
            },
            select: { id: true, created_at: true },
          })
        : null;
      if (current && !isAfter(target, current)) {
        // Row 110: reading the chat takes my own unread mark off (a write
        // only when the mark is there).
        if (me.marked_unread_at) {
          await tx.conversationParticipant.update({
            where: {
              conversation_id_user_id: {
                conversation_id: id,
                user_id: user.sub,
              },
            },
            data: { marked_unread_at: null },
          });
        }
        return { lastReadMessageId: current.id, moved: false };
      }
      await tx.conversationParticipant.update({
        where: {
          conversation_id_user_id: { conversation_id: id, user_id: user.sub },
        },
        data: {
          last_read_message_id: target.id,
          last_read_at: new Date(),
          marked_unread_at: null,
          // Reading it means it got there (the grey ticks never lag the blue).
          ...(await this.deliveredPatch(
            tx,
            id,
            me.last_delivered_message_id,
            target,
          )),
        },
      });
      return { lastReadMessageId: target.id, moved: true };
    });
    if (result.moved) {
      // No user id: the receiver knows it was the other side.
      this.realtime.toUsers(
        await this.receiptAudience(conv, user.sub),
        'message:read',
        {
          conversationId: id,
          lastReadMessageId: result.lastReadMessageId,
          readAt: new Date().toISOString(),
        },
      );
      // Owner 2026-10-22 (load audit finding 2): my devices clear this
      // chat's unread pill in their list without reloading it.
      this.realtime.toUsers([user.sub], 'conversation:read', {
        conversationId: id,
        lastReadMessageId: result.lastReadMessageId,
      });
      await this.badges.chatsChanged(user.sub);
    }
    return { lastReadMessageId: result.lastReadMessageId };
  }

  /**
   * Best effort, never blocks or fails the list. Load audit 6 (2026-10-23):
   * this used to call `delivered()` for each of up to 20 chats one after the
   * other (about 6 queries and a SERIALIZABLE transaction each = 120 round
   * trips on a phone that was offline for a day). Now it is ONE forward-only
   * UPDATE for all of them; only the chats that really moved are announced.
   */
  private async deliverListed(
    viewerId: string,
    convs: Conversation[],
    messageOf: Map<string, { id: string; sender_id: string | null }>,
    partOf: Map<string, { last_delivered_message_id: string | null }>,
  ): Promise<void> {
    const cids: string[] = [];
    const mids: string[] = [];
    for (const c of convs) {
      const m = c.last_message_id ? messageOf.get(c.last_message_id) : null;
      if (!m || m.sender_id === null || m.sender_id === viewerId) continue;
      if (
        partOf.get(`${c.id}:${viewerId}`)?.last_delivered_message_id === m.id
      ) {
        continue;
      }
      cids.push(c.id);
      mids.push(m.id);
      if (cids.length >= 20) break;
    }
    if (cids.length === 0) return;
    try {
      const moved = await this.prisma.$queryRaw<
        { conversation_id: string; last_delivered_message_id: string }[]
      >`
        UPDATE conversation_participants cp
        SET last_delivered_message_id = tm.id,
            last_delivered_at = now(),
            updated_at = now()
        FROM unnest(${cids}::UUID[], ${mids}::UUID[]) AS v(cid, mid)
        JOIN messages tm ON tm.id = v.mid AND tm.conversation_id = v.cid
        WHERE cp.conversation_id = v.cid
          AND cp.user_id = ${viewerId}::UUID
          AND tm.conversation_id = v.cid
          AND (cp.last_delivered_message_id IS NULL
               OR NOT EXISTS (
                 SELECT 1 FROM messages cm
                 WHERE cm.id = cp.last_delivered_message_id
                   AND cm.conversation_id = cp.conversation_id
                   AND (cm.created_at, cm.id) >= (tm.created_at, tm.id)))
        RETURNING cp.conversation_id::TEXT AS conversation_id,
                  cp.last_delivered_message_id::TEXT AS last_delivered_message_id`;
      const byId = new Map(convs.map((c) => [c.id, c]));
      for (const r of moved) {
        const c = byId.get(r.conversation_id);
        if (!c) continue;
        this.realtime.toUsers(
          await this.receiptAudience(c, viewerId),
          'message:delivered',
          {
            conversationId: c.id,
            lastDeliveredMessageId: r.last_delivered_message_id,
            deliveredAt: new Date().toISOString(),
          },
        );
      }
    } catch {
      // The list is what matters.
    }
  }

  /**
   * Pack B (25.11, ROUND2 #4): who hears that [readerId] got or read this
   * chat's messages — the other side. For the client that is the attorney
   * AND the firm's team on the bid (they write in the chat too, PR-5, and
   * their ticks move only on these events); for anyone on the attorney's
   * side, the client. [] team for every other chat (no query then).
   */
  private async receiptAudience(
    conv: Pick<
      Conversation,
      'client_id' | 'attorney_id' | 'case_id' | 'bid_id'
    >,
    readerId: string,
  ): Promise<string[]> {
    if (readerId !== conv.client_id) return [conv.client_id];
    const team = (await this.team?.teamOfChat(conv)) ?? [];
    return [...new Set([conv.attorney_id, ...team])].filter(
      (id) => id !== readerId,
    );
  }

  /** The delivered pointer moves forward only: the patch to set it to
   * [target], or nothing when it is already at or past it. */
  private async deliveredPatch(
    tx: Pick<PrismaService, 'message'>,
    conversationId: string,
    currentId: string | null,
    target: { id: string; created_at: Date },
  ): Promise<{ last_delivered_message_id?: string; last_delivered_at?: Date }> {
    const current = currentId
      ? await tx.message.findUnique({
          where: {
            id_conversation_id: {
              id: currentId,
              conversation_id: conversationId,
            },
          },
          select: { id: true, created_at: true },
        })
      : null;
    if (current && !isAfter(target, current)) return {};
    return {
      last_delivered_message_id: target.id,
      last_delivered_at: new Date(),
    };
  }

  /**
   * POST /conversations/:id/delivered — this person's device has the messages
   * up to [lastDeliveredMessageId] (WhatsApp's two grey ticks). Forward only,
   * idempotent; the sender hears `message:delivered`.
   */
  async delivered(
    user: RequestUser,
    id: string,
    lastDeliveredMessageId: string,
  ): Promise<{ lastDeliveredMessageId: string | null }> {
    const conv = await this.load(user, id);
    const target = await this.prisma.message.findFirst({
      where: { id: lastDeliveredMessageId, conversation_id: id },
      select: { id: true, created_at: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Message not found.',
      });
    }
    const result = await withTxRetry(this.prisma, async (tx) => {
      const me = await tx.conversationParticipant.findUniqueOrThrow({
        where: {
          conversation_id_user_id: { conversation_id: id, user_id: user.sub },
        },
        select: { last_delivered_message_id: true },
      });
      const patch = await this.deliveredPatch(
        tx,
        id,
        me.last_delivered_message_id,
        target,
      );
      if (patch.last_delivered_message_id === undefined) {
        return { id: me.last_delivered_message_id, moved: false };
      }
      await tx.conversationParticipant.update({
        where: {
          conversation_id_user_id: { conversation_id: id, user_id: user.sub },
        },
        data: patch,
      });
      return { id: target.id, moved: true };
    });
    if (result.moved) {
      this.realtime.toUsers(
        await this.receiptAudience(conv, user.sub),
        'message:delivered',
        {
          conversationId: id,
          lastDeliveredMessageId: result.id,
          deliveredAt: new Date().toISOString(),
        },
      );
    }
    return { lastDeliveredMessageId: result.id };
  }

  /** PATCH /conversations/:id/mute (§8.4): push off until `until`. */
  async mute(
    user: RequestUser,
    id: string,
    until: string | null,
  ): Promise<ConversationDto> {
    const conv = await this.load(user, id);
    await this.prisma.conversationParticipant.update({
      where: {
        conversation_id_user_id: { conversation_id: id, user_id: user.sub },
      },
      data: { muted_until: until ? new Date(until) : null },
    });
    const [dto] = await this.present([conv], user.sub);
    return dto;
  }

  /** Owner 2026-10-21: «mute calls» of this chat only (messages untouched). */
  async muteCalls(
    user: RequestUser,
    id: string,
    muted: boolean,
  ): Promise<ConversationDto> {
    const conv = await this.load(user, id);
    await this.prisma.conversationParticipant.update({
      where: {
        conversation_id_user_id: { conversation_id: id, user_id: user.sub },
      },
      data: { calls_muted: muted },
    });
    const [dto] = await this.present([conv], user.sub);
    return dto;
  }

  /**
   * OQ-028: nothing goes from one side of a chat to the other while one
   * blocks the other — except the chat of a case in progress (blocks leave
   * it untouched). R2B-5 (14.11): send, edit, react, pin and the
   * disappearing timer all go through this one check.
   */
  async assertNotBlockedIn(
    userId: string,
    conv: {
      client_id: string;
      attorney_id: string;
      case_id: string | null;
      contacts_unlocked: boolean;
      status: string;
    },
  ): Promise<void> {
    if (await caseWorkOngoing(this.prisma, conv)) return;
    await this.blocks.assertNotBlocked(
      userId,
      userId === conv.client_id ? conv.attorney_id : conv.client_id,
    );
  }

  /**
   * PATCH …/disappearing (owner 2026-10-21, WhatsApp): either side of a
   * direct chat switches the timer for new messages (null = off). Case chats
   * keep their history (the case journal and the attorney's file rely on it),
   * and a chat that is only a request cannot change it yet. A service line
   * «X turned on disappearing messages: 7 days» is posted for both sides.
   */
  async setDisappearing(
    user: RequestUser,
    id: string,
    afterS: number | null,
  ): Promise<ConversationDto> {
    const conv = await this.load(user, id);
    if (conv.case_id !== null || conv.request_status === 'pending') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Disappearing messages are not available in this chat.',
      });
    }
    if (conv.status === 'closed') throw closed();
    // R2B-5: not while one side blocks the other (as for send).
    await this.assertNotBlockedIn(user.sub, conv);
    if (conv.disappear_after_s === afterS) {
      return (await this.present([conv], user.sub))[0];
    }
    const body = afterS ? `disappear:${afterS}` : 'disappear_off';
    const { message, updated } = await withTxRetry(this.prisma, async (tx) => {
      const updated = await tx.conversation.update({
        where: { id },
        data: { disappear_after_s: afterS },
      });
      // The line carries the actor (sender); it never expires itself.
      const message = await tx.message.create({
        data: {
          conversation_id: id,
          sender_id: user.sub,
          type: 'system',
          body_original: body,
          body_display: body,
          client_message_id: `system:disappear:${randomUUID()}`,
        },
      });
      await tx.conversation.update({
        where: { id },
        data: {
          last_message_at: message.created_at,
          last_message_id: message.id,
        },
      });
      await tx.conversationParticipant.updateMany({
        where: { conversation_id: id, hidden_at: { not: null } },
        data: { hidden_at: null },
      });
      return { message, updated };
    });
    // Pack B (ROUND2 #5): every member, the firm's team too (as announce()).
    const team = (await this.team?.teamOfChat(updated)) ?? [];
    for (const uid of new Set([
      updated.client_id,
      updated.attorney_id,
      ...team,
    ])) {
      this.realtime.toUsers([uid], 'message:new', {
        message: this.toMessage(message, uid, updated),
      });
      this.realtime.toUsers([uid], 'conversation:update', {
        conversationId: id,
      });
    }
    return (await this.present([updated], user.sub))[0];
  }

  private sideOf(user: RequestUser): 'client_id' | 'attorney_id' | null {
    return user.role === 'client'
      ? 'client_id'
      : user.role === 'attorney'
        ? 'attorney_id'
        : null;
  }

  /** 404 unless the caller takes part in the conversation. */
  async ensureMember(user: RequestUser, id: string): Promise<void> {
    await this.load(user, id);
  }

  /** The conversation if the caller takes part in it, else 404. */
  /**
   * Owner 2026-10-20 («Сохранённое»): what kind of saved item message [id]
   * is, for a reader of its chat. 404 when the person is not in the chat or
   * the message is gone; 400 for a message that is not worth saving (a
   * system line, a call, a sticker).
   */
  async savableKind(
    user: RequestUser,
    id: string,
  ): Promise<{ kind: SavedChatKind; conversationId: string }> {
    const m = await this.prisma.message.findFirst({
      where: { id, deleted_at: null },
    });
    if (!m) throw notFound();
    await this.load(user, m.conversation_id);
    const conversationId = m.conversation_id;
    switch (m.type) {
      case 'voice':
        return { kind: 'voice', conversationId };
      case 'contact':
        return { kind: 'contact', conversationId };
      case 'place':
        return { kind: 'place', conversationId };
      case 'attachment': {
        const f = m.file_id
          ? (await this.files.attachmentUrls([m.file_id])).get(m.file_id)
          : undefined;
        const mime = f?.mime ?? '';
        return {
          kind:
            isImageMime(mime) || mime.startsWith('video/') ? 'media' : 'file',
          conversationId,
        };
      }
      case 'text':
        return {
          kind: URL_RE.test(this.openBody(m.body_display, m.id))
            ? 'link'
            : 'text',
          conversationId,
        };
      default:
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'This message cannot be saved.',
          details: { field: 'messageId' },
        });
    }
  }

  /**
   * The messages [ids] as [user] reads them, each with its chat — newest
   * order of [ids] kept. A message of a chat the person is not in (or a
   * deleted one) is left out.
   */
  async messagesWithChats(
    user: RequestUser,
    refs: { id: string; conversationId: string }[],
  ): Promise<{ message: MessageDto; chat: ConversationDto }[]> {
    if (refs.length === 0) return [];
    const ids = refs.map((r) => r.id);
    const rows = await messagesByPairs(this.prisma, refs);
    const convs = new Map<string, Conversation>();
    for (const convId of new Set(rows.map((r) => r.conversation_id))) {
      try {
        convs.set(convId, await this.load(user, convId));
      } catch {
        // Not in that chat any more: its messages stay unseen.
      }
    }
    const readable = rows.filter((r) => convs.has(r.conversation_id));
    const [urls, chats] = await Promise.all([
      this.mediaLinks(readable),
      this.present([...convs.values()], user.sub),
    ]);
    const chatOf = new Map(chats.map((c) => [c.id, c]));
    const byId = new Map(readable.map((r) => [r.id, r]));
    const out: { message: MessageDto; chat: ConversationDto }[] = [];
    for (const id of ids) {
      const r = byId.get(id);
      const chat = r ? chatOf.get(r.conversation_id) : undefined;
      if (!r || !chat) continue;
      out.push({
        message: this.toMessage(
          r,
          user.sub,
          convs.get(r.conversation_id),
          urls,
        ),
        chat,
      });
    }
    return out;
  }

  /** One entry per sent message until its live event, badge and push went
   * out (S1-3). Redis trouble only loses the safety net, never the send. */
  private async markEffectsPending(
    conversationId: string,
    senderId: string,
    clientMessageId: string,
    silent: boolean,
    requestFirst: boolean,
  ): Promise<string | null> {
    const redis = this.redis;
    if (!redis || redis.status !== 'ready') return null;
    const member = JSON.stringify({
      c: conversationId,
      u: senderId,
      k: clientMessageId,
      s: silent ? 1 : 0,
      r: requestFirst ? 1 : 0,
    });
    try {
      await redis.zadd(EFFECTS_PENDING_KEY, Date.now(), member);
      return member;
    } catch {
      return null;
    }
  }

  /** M3: remembers which message holds a file still being checked, so the
   * end of the check (in the worker) finds its chat on any database. */
  private async markScanWait(
    fileId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    if (!this.redis || this.redis.status !== 'ready') return;
    try {
      await this.redis.set(
        scanWaitKey('chat', fileId),
        JSON.stringify({ c: conversationId, m: messageId }),
        'EX',
        SCAN_WAIT_TTL_SEC,
      );
    } catch {
      // the lookup by file below covers it (one database)
    }
  }

  /**
   * M3 (owner 25.11, Slack / Telegram / WhatsApp): the check of a file that
   * is already in a message ended. Everybody in the chat gets the message
   * again (`message:updated`): clean, the file appears for the recipient;
   * infected or failed, it shows as removed for everyone. Nobody ever got a
   * link to it before (FilesService.unscannedChatFiles).
   */
  async fileScanEnded(file: { id: string; purpose: string }): Promise<void> {
    let where: { c: string; m: string } | null = null;
    if (this.redis && this.redis.status === 'ready') {
      try {
        const raw = await this.redis.getdel(scanWaitKey('chat', file.id));
        if (raw) where = JSON.parse(raw) as { c: string; m: string };
      } catch {
        where = null;
      }
    }
    const publish = async (): Promise<void> => {
      const row = where
        ? await this.prisma.message.findUnique({
            where: {
              id_conversation_id: { id: where.m, conversation_id: where.c },
            },
          })
        : await this.prisma.message.findFirst({ where: { file_id: file.id } });
      if (!row || row.file_id !== file.id) return;
      const conv = await this.prisma.conversation.findUnique({
        where: { id: row.conversation_id },
      });
      if (!conv) return;
      const urls = await this.mediaLinks([row]);
      const team = (await this.team?.teamOfChat(conv)) ?? [];
      for (const uid of new Set([conv.client_id, conv.attorney_id, ...team])) {
        this.realtime.toUsers([uid], 'message:updated', {
          message: this.toMessage(row, uid, conv, urls),
        });
      }
    };
    await (where ? shardContext.runForCase(where.c, publish) : publish());
  }

  private async clearEffectsPending(member: string | null): Promise<void> {
    if (!member || !this.redis || this.redis.status !== 'ready') return;
    try {
      await this.redis.zrem(EFFECTS_PENDING_KEY, member);
    } catch {
      // the sweep clears a stale entry itself
    }
  }

  /** The live event to both sides, the recipient's badge and push. Returns
   * the media links (the sender's own response reuses them). */
  private async deliverEffects(
    conv: Conversation,
    message: Message,
    senderId: string,
    flags: {
      silent: boolean;
      requestFirst: boolean;
      recount?: boolean;
      /** M12: key id → sealed push preview (only this push job keeps it). */
      sealed?: Record<string, string>;
    },
  ): Promise<MediaLinks> {
    // Firms audit 16.11 (PR-5): the firm's team on the bid gets the chat's
    // messages like its attorney does ([] for every other chat).
    const team = (await this.team?.teamOfChat(conv)) ?? [];
    const others = [
      ...new Set([conv.client_id, conv.attorney_id, ...team]),
    ].filter((id) => id !== senderId);
    // The first delivery runs right after the insert (no reactions / pins
    // can exist yet); a re-run after a crash reads them like any page.
    const urls = await this.mediaLinks([message], { fresh: !flags.recount });
    this.realtime.toUsers([senderId], 'message:new', {
      message: this.toMessage(message, senderId, undefined, urls),
    });
    for (const other of others) {
      this.realtime.toUsers([other], 'message:new', {
        message: this.toMessage(message, other, conv, urls),
      });
    }
    // §8.4: badge + push to the recipient (the dispatcher skips it while
    // the chat is open on their device or muted). OQ-043: a pending
    // request pings once (its first message) and never bumps the badge.
    const pendingRequest =
      conv.request_status === 'pending' && conv.requested_by === senderId;
    for (const other of others) {
      if (!pendingRequest) {
        // A re-run after a crash recounts instead of adding one more.
        if (flags.recount) await this.badges.chatsChanged(other);
        else await this.badges.messageArrived(other);
      }
      // Owner 2026-10-21: a forwarded batch rings once (its last message).
      if ((!pendingRequest || flags.requestFirst) && !flags.silent) {
        await this.notifications.emit({
          type: 'new_message',
          recipientId: other,
          payload: {
            conversationId: conv.id,
            messageId: message.id,
            ...(flags.sealed ? { sealed: flags.sealed } : {}),
          },
        });
      }
    }
    return urls;
  }

  /**
   * S1-3, cron `chat.redeliver`: finishes the effects of messages whose
   * request died after the commit. Entries older than 2 minutes: the message
   * is looked up (it may never have been stored), its live event, badge
   * and push are sent, the entry is dropped.
   */
  async redeliverPending(
    now = Date.now(),
  ): Promise<{ redelivered: number; dropped: number }> {
    const out = { redelivered: 0, dropped: 0 };
    const redis = this.redis;
    if (!redis || redis.status !== 'ready') return out;
    const due = await redis.zrangebyscore(
      EFFECTS_PENDING_KEY,
      '-inf',
      now - EFFECTS_GRACE_MS,
      'LIMIT',
      0,
      EFFECTS_SWEEP_BATCH,
    );
    for (const member of due) {
      try {
        const p = JSON.parse(member) as {
          c: string;
          u: string;
          k: string;
          s: number;
          r: number;
        };
        const done = await shardContext.runForCase(p.c, async () => {
          const message = await this.findOwn(p.c, p.u, p.k);
          const conv = message
            ? await this.prisma.conversation.findUnique({
                where: { id: p.c },
              })
            : null;
          if (!message || !conv) return false;
          await this.deliverEffects(conv, message, p.u, {
            silent: p.s === 1,
            requestFirst: p.r === 1,
            recount: true,
          });
          return true;
        });
        if (done) out.redelivered += 1;
        else out.dropped += 1;
      } catch {
        // A database blip: retried next run, unless the entry is an hour
        // old (then it is dropped: the next list open shows the message).
        const sentAt = Number(await redis.zscore(EFFECTS_PENDING_KEY, member));
        if (now - sentAt < 3_600_000) continue;
        out.dropped += 1;
      }
      await redis.zrem(EFFECTS_PENDING_KEY, member);
    }
    return out;
  }

  async load(user: RequestUser, id: string): Promise<Conversation> {
    const conv = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conv) throw notFound();
    if (conv.client_id === user.sub || conv.attorney_id === user.sub) {
      return conv;
    }
    // Firms audit 16.11 (PR-5): a lawyer who joined the firm's bid works in
    // its chat on the attorney's side (read and post), while still in the
    // firm. Their own row (read marks, folders) is made on first open.
    if (
      user.role === 'attorney' &&
      conv.pair_kind === 'attorney_client' &&
      this.team &&
      (await this.team.inChat(user.sub, conv))
    ) {
      await this.prisma.conversationParticipant.createMany({
        data: [{ conversation_id: conv.id, user_id: user.sub }],
        skipDuplicates: true,
      });
      return conv;
    }
    throw notFound();
  }

  /** Signed links for the voice notes and attachments among [rows]. */
  async mediaLinks(
    rows: Message[],
    opts: { fresh?: boolean } = {},
  ): Promise<MediaLinks> {
    const ids = (type: Message['type']) =>
      rows.flatMap((m) => (m.type === type && m.file_id ? [m.file_id] : []));
    const [voice, attachments, stickers, contacts, posts, blobs] =
      await Promise.all([
        this.files.voiceLinks(ids('voice')),
        this.files.attachmentUrls(ids('attachment')),
        this.stickers.forMessages(
          rows.flatMap((m) => (m.sticker_id ? [m.sticker_id] : [])),
        ),
        this.contactCards(
          rows.flatMap((m) =>
            m.type === 'contact' ? [this.openBody(m.body_display, m.id)] : [],
          ),
        ),
        // Owner 2026-10-21: the cards of shared posts, in one batch.
        this.postCards?.cards(
          rows.flatMap((m) => {
            const postId = this.openBody(m.body_display, m.id);
            return m.type === 'post' && UUID_RE.test(postId) ? [postId] : [];
          }),
        ) ?? Promise.resolve(new Map<string, SharedPostCardDto>()),
        // Item 25: the ciphertext of encrypted files.
        this.files.e2eeBlobUrls(ids('mls')),
      ]);
    // M3: files still checked or removed (no query when all are clean).
    const [unscannedAttachments, unscannedVoice] = await Promise.all([
      this.files.unscannedChatFiles(
        'chat_attachment',
        ids('attachment'),
        new Set(attachments.keys()),
      ),
      this.files.unscannedChatFiles(
        'chat_voice',
        ids('voice'),
        new Set(voice.keys()),
      ),
    ]);
    const extras = await loadMessageExtras(this.prisma, rows, opts);
    return {
      voice,
      attachments,
      stickers,
      contacts,
      posts,
      blobs,
      extras,
      unscanned: { attachments: unscannedAttachments, voice: unscannedVoice },
    };
  }

  private findOwn(id: string, senderId: string, clientMessageId: string) {
    return this.prisma.message.findUnique({
      where: {
        conversation_id_sender_id_client_message_id: {
          conversation_id: id,
          sender_id: senderId,
          client_message_id: clientMessageId,
        },
      },
    });
  }

  private openBody(stored: string, messageId: string): string {
    return this.cipher?.open(stored, messageId) ?? stored;
  }

  /** Owner 2026-10-20: only an attorney's public profile can be shared. */
  private async sharableAttorney(
    viewerId: string,
    userId: string,
  ): Promise<boolean> {
    // Not a person the sender blocked or who blocked the sender.
    if ((await this.blocks.hiddenIds(viewerId)).has(userId)) return false;
    const u = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: 'active',
        role: 'attorney',
        attorney_profile: { isNot: null },
      },
      select: { id: true },
    });
    return u !== null;
  }

  /** Owner 2026-10-21 (Instagram «Поделиться»): a post the sender can see
   * whose author did not block them (nor they the author). */
  private async sharablePost(
    viewerId: string,
    postId: string,
  ): Promise<boolean> {
    const authorId = await this.postCards?.sharableAuthor(viewerId, postId);
    if (!authorId) return false;
    if (authorId === viewerId) return true;
    return !(await this.blocks.hiddenIds(viewerId)).has(authorId);
  }

  /** The public cards of the attorneys shared in a page of messages. */
  private async contactCards(
    ids: string[],
  ): Promise<Map<string, ContactCardDto>> {
    const unique = [...new Set(ids)].filter((x) => UUID_RE.test(x));
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique }, role: 'attorney', status: 'active' },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        attorney_profile: {
          select: {
            username: true,
            firm_names: true,
            trust_badge: true,
            licenses: {
              where: { license_status: 'verified' },
              select: { state_code: true },
            },
            practice_areas: {
              select: {
                practice_area: { select: { i18n_key: true, sort: true } },
              },
            },
          },
        },
      },
    });
    const avatars = await this.files.avatarUrlsMany(
      users.map((u) => u.avatar_file_id),
    );
    const out = new Map<string, ContactCardDto>();
    for (const u of users) {
      const p = u.attorney_profile;
      if (!p) continue;
      out.set(u.id, {
        userId: u.id,
        username: p.username,
        displayName: fullName(u.first_name, u.last_name) ?? p.username,
        avatarUrl: u.avatar_file_id
          ? (avatars.get(u.avatar_file_id)?.url256 ?? null)
          : null,
        verifiedBadge: p.trust_badge,
        firmNames: p.firm_names,
        practiceKeys: p.practice_areas
          .map((a) => a.practice_area)
          .sort((a, b) => a.sort - b.sort)
          .slice(0, 6)
          .map((a) => a.i18n_key),
        licensedStates: [
          ...new Set(p.licenses.map((l) => l.state_code)),
        ].sort(),
      });
    }
    return out;
  }

  /** A stored attachment name as plain text (legacy rows are plaintext). */
  private openFileName(
    stored: string | null,
    messageId: string,
  ): string | null {
    if (stored === null) return null;
    const plain =
      this.cipher?.openField(stored, fileNameAad(messageId)) ?? stored;
    return plain === '' ? null : plain;
  }

  private seal(text: string, messageId: string): string {
    return this.cipher?.seal(text, messageId) ?? text;
  }

  /** Security review (docs/05): while contacts are locked the attorney
   * must not learn the client's user id — their messages come with
   * senderId null (the app treats "not mine" the same). */
  toMessage(
    m: Message,
    viewerId: string,
    conv?: Pick<
      Conversation,
      'attorney_id' | 'client_id' | 'contacts_unlocked' | 'case_id'
    >,
    media?: MediaLinks,
  ): MessageDto {
    const hideSender =
      conv !== undefined &&
      conv.case_id !== null &&
      // The attorney's side: the attorney and the firm's team (PR-5).
      viewerId !== conv.client_id &&
      !conv.contacts_unlocked &&
      m.sender_id === conv.client_id;
    const revoked = m.revoked_at !== null;
    const extras = media?.extras;
    const target = m.reply_to_id
      ? extras?.replyTargets.get(m.reply_to_id)
      : undefined;
    const reactionRows = extras?.reactions.get(m.id) ?? [];
    const reactions: ReactionDto[] = [];
    for (const r of reactionRows) {
      const have = reactions.find((x) => x.emoji === r.emoji);
      if (have) {
        have.count += 1;
        have.mine ||= r.userId === viewerId;
      } else {
        reactions.push({
          emoji: r.emoji,
          count: 1,
          mine: r.userId === viewerId,
        });
      }
    }
    return {
      id: m.id,
      conversationId: m.conversation_id,
      senderId: hideSender ? null : m.sender_id,
      sentByAssistant: m.sent_by_name,
      type: m.type,
      editedAt: m.edited_at,
      revoked,
      forwarded: m.forwarded && !revoked,
      forwardedFrom: m.forwarded && !revoked ? m.forwarded_from_name : null,
      replyTo:
        target && !revoked
          ? {
              id: target.id,
              senderId: target.sender_id,
              type: target.type as ReplyPreviewDto['type'],
              revoked: target.revoked_at !== null,
              snippet:
                target.revoked_at || target.type !== 'text'
                  ? ''
                  : [
                      ...(this.cipher?.open(target.body_display, target.id) ??
                        target.body_display),
                    ]
                      .slice(0, 120)
                      .join(''),
            }
          : null,
      reactions: revoked ? [] : reactions,
      pinned: !revoked && (extras?.pinned.has(m.id) ?? false),
      voice:
        m.type === 'voice' && !revoked
          ? this.voiceOf(m, viewerId, media)
          : null,
      attachment:
        m.type === 'attachment' && !revoked
          ? this.attachmentOf(m, viewerId, media)
          : null,
      sticker:
        m.type === 'sticker' && m.sticker_id && !revoked
          ? (media?.stickers.get(m.sticker_id) ?? null)
          : null,
      call:
        m.type === 'call'
          ? {
              outcome: m.body_display as CallLogDto['outcome'],
              durationSec: Math.round((m.duration_ms ?? 0) / 1000),
            }
          : null,
      contact:
        m.type === 'contact'
          ? (media?.contacts.get(this.openBody(m.body_display, m.id)) ?? null)
          : null,
      post:
        m.type === 'post' && !revoked
          ? (media?.posts.get(this.openBody(m.body_display, m.id)) ?? null)
          : null,
      body: revoked
        ? ''
        : (this.cipher?.open(m.body_display, m.id) ?? m.body_display),
      contactMasked: m.contact_masked,
      // Item 25: the MLS ciphertext of an end-to-end encrypted message.
      ciphertext:
        m.type === 'mls' && m.ciphertext && !revoked
          ? Buffer.from(m.ciphertext).toString('base64')
          : null,
      mlsEpoch: m.type === 'mls' ? m.mls_epoch : null,
      // Message franking: the receivers check HMAC(k, P) against it.
      frankingTag:
        m.type === 'mls' && m.franking_tag && !revoked
          ? Buffer.from(m.franking_tag).toString('base64')
          : null,
      blobUrl:
        m.type === 'mls' && m.file_id && !revoked
          ? (media?.blobs?.get(m.file_id)?.url ?? null)
          : null,
      clientMessageId: m.sender_id === viewerId ? m.client_message_id : null,
      seq: m.seq,
      createdAt: m.created_at,
      expiresAt: m.expires_at,
    };
  }

  /** OQ-047: the attached file as the bubble shows it (links once the
   * scan passed). M3 (owner 25.11): while it still runs only the sender
   * gets a link (their own upload); the others see it as processing, and
   * an infected or failed file as removed. */
  private attachmentOf(
    m: Message,
    viewerId: string,
    media?: MediaLinks,
  ): ChatAttachmentDto {
    const f = m.file_id ? media?.attachments.get(m.file_id) : undefined;
    const u = m.file_id
      ? media?.unscanned?.attachments.get(m.file_id)
      : undefined;
    const mime = f?.mime ?? u?.mime ?? null;
    return {
      fileId: m.file_id ?? '',
      name: this.openFileName(m.file_name, m.id) ?? 'file',
      mime,
      sizeBytes: f?.sizeBytes ?? u?.sizeBytes ?? null,
      isImage: mime ? isImageMime(mime) : false,
      url: f?.url ?? (u && u.ownerId === viewerId ? u.ownerUrl : null),
      previewUrl: f?.previewUrl ?? null,
      width: f?.width ?? null,
      height: f?.height ?? null,
      blurhash: f?.blurhash ?? null,
      state: u?.state ?? 'ready',
    };
  }

  /** OQ-040 voice note; M3 states as for [attachmentOf]. */
  private voiceOf(
    m: Message,
    viewerId: string,
    media?: MediaLinks,
  ): VoiceNoteDto {
    const v = m.file_id ? media?.voice.get(m.file_id) : undefined;
    const u = m.file_id ? media?.unscanned?.voice.get(m.file_id) : undefined;
    return {
      url: v?.url ?? (u && u.ownerId === viewerId ? u.ownerUrl : null),
      // Owner row 146: the AAC/M4A copy of a browser note (iPhone).
      m4aUrl: v?.m4aUrl ?? null,
      durationMs: m.duration_ms ?? 0,
      waveform: m.waveform,
      listened: m.listened_at !== null,
      state: u?.state ?? 'ready',
    };
  }

  /** Rows → DTOs for one viewer in a fixed number of queries. */
  private async present(
    convs: Conversation[],
    viewerId: string,
  ): Promise<ConversationDto[]> {
    if (convs.length === 0) return [];
    const ids = convs.map((c) => c.id);
    const otherIds = convs.map((c) =>
      c.client_id === viewerId ? c.attorney_id : c.client_id,
    );
    const [cases, users, lastMessages, participants, unread] =
      await Promise.all([
        this.prisma.case.findMany({
          where: {
            id: {
              in: convs.flatMap((c) => (c.case_id ? [c.case_id] : [])),
            },
          },
          select: { id: true, title: true },
        }),
        this.prisma.user.findMany({
          where: { id: { in: otherIds } },
          select: {
            id: true,
            role: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            attorney_profile: {
              select: {
                username: true,
                verification_status: true,
                name_mismatch: true,
                trust_badge: true,
              },
            },
            client_profile: { select: { username: true } },
          },
        }),
        messagesByPairs(
          this.prisma,
          convs.flatMap((c) =>
            c.last_message_id
              ? [{ id: c.last_message_id, conversationId: c.id }]
              : [],
          ),
        ),
        this.prisma.conversationParticipant.findMany({
          where: { conversation_id: { in: ids } },
          select: {
            conversation_id: true,
            user_id: true,
            last_read_message_id: true,
            last_read_at: true,
            last_delivered_message_id: true,
            muted_until: true,
            calls_muted: true,
            folder: true,
            waiting_since: true,
            note: true,
            pinned_at: true,
            marked_unread_at: true,
          },
        }),
        this.prisma.$queryRaw<{ id: string; n: bigint }[]>`
          SELECT cp.conversation_id::TEXT AS id,
                 (SELECT count(*) FROM (
                    SELECT 1 FROM messages m
                    WHERE m.conversation_id = cp.conversation_id
                      AND m.deleted_at IS NULL
                      AND (m.sender_id IS NULL OR m.sender_id <> ${viewerId}::UUID)
                      AND (lr.id IS NULL OR m.created_at >= lr.created_at)
                      AND (lr.id IS NULL
                           OR (m.created_at, m.id) > (lr.created_at, lr.id))
                    ORDER BY m.created_at DESC
                    LIMIT ${UNREAD_CAP}) x) AS n
          FROM conversation_participants cp
          LEFT JOIN messages lr ON lr.id = cp.last_read_message_id
                               AND lr.conversation_id = cp.conversation_id
          WHERE cp.user_id = ${viewerId}::UUID
            AND cp.conversation_id = ANY(${ids}::UUID[])`,
      ]);
    const titleOf = new Map(cases.map((c) => [c.id, c.title]));
    const userOf = new Map(users.map((u) => [u.id, u]));
    const messageOf = new Map(lastMessages.map((m) => [m.id, m]));
    const partOf = new Map(
      participants.map((p) => [`${p.conversation_id}:${p.user_id}`, p]),
    );
    const unreadOf = new Map(unread.map((r) => [r.id, Number(r.n)]));
    // Opening the app (the list loads) is a pull of the inbox: whatever sits
    // there has reached this device, the sender's ticks turn grey-double.
    void this.deliverListed(viewerId, convs, messageOf, partOf);
    const avatars = await this.files.avatarUrlsMany(
      users.map((u) => u.avatar_file_id),
    );
    // Owner 2026-10-01: online / last seen (reciprocal activity status).
    const blockedIds = await this.blocks.hiddenIds(viewerId);
    const presence = await this.presence.snapshot(
      viewerId,
      otherIds.filter((id) => !blockedIds.has(id)),
    );

    const out: ConversationDto[] = [];
    for (const c of convs) {
      const otherId = c.client_id === viewerId ? c.attorney_id : c.client_id;
      const other = userOf.get(otherId);
      const otherIsClient = other?.role !== 'attorney';
      // docs/04 §9: an attorney sees "Клиент по кейсу «…»" (no name, no
      // photo) until contacts are unlocked; a client always sees the
      // attorney's public identity.
      // OQ-043: in a direct chat both sides are public profiles.
      const hidden =
        otherIsClient && !c.contacts_unlocked && c.case_id !== null;
      // No "Seen" for the requester until the request is accepted.
      const seenHidden =
        c.request_status === 'pending' && c.requested_by === viewerId;
      const last = c.last_message_id ? messageOf.get(c.last_message_id) : null;
      out.push({
        id: c.id,
        caseId: c.case_id,
        caseTitle: c.case_id ? (titleOf.get(c.case_id) ?? null) : null,
        status: c.status,
        contactsUnlocked: c.contacts_unlocked,
        counterpart: {
          id: hidden ? null : otherId,
          kind: otherIsClient ? 'client' : 'attorney',
          displayName:
            hidden || !other
              ? null
              : fullName(other.first_name, other.last_name),
          username:
            other?.attorney_profile?.username ??
            (hidden ? null : (other?.client_profile?.username ?? null)),
          avatarUrl:
            hidden || !other
              ? null
              : other.avatar_file_id
                ? (avatars.get(other.avatar_file_id)?.url256 ?? null)
                : null,
          // Owner 2026-10-18: the full-size photo for the full-screen view
          // (the 256 px one looked blurry there).
          avatarFullUrl:
            hidden || !other || !other.avatar_file_id
              ? null
              : (avatars.get(other.avatar_file_id)?.url ?? null),
          verifiedBadge: other?.attorney_profile?.trust_badge ?? false,
          ...(() => {
            const p = hidden || seenHidden ? undefined : presence.get(otherId);
            return {
              online: p ? p.online : null,
              lastSeenAt: p?.lastSeenAt?.toISOString() ?? null,
            };
          })(),
        },
        lastMessage: last ? this.toMessage(last, viewerId, c) : null,
        lastMessageAt: c.last_message_at,
        unreadCount: unreadOf.get(c.id) ?? 0,
        disappearAfterS: c.disappear_after_s,
        e2eeSince: c.e2ee_since,
        mutedUntil: partOf.get(`${c.id}:${viewerId}`)?.muted_until ?? null,
        callsMuted: partOf.get(`${c.id}:${viewerId}`)?.calls_muted ?? false,
        counterpartLastReadMessageId: seenHidden
          ? null
          : (partOf.get(`${c.id}:${otherId}`)?.last_read_message_id ?? null),
        // Delivery is not "seen": the setting that hides reading leaves it.
        counterpartLastDeliveredMessageId:
          partOf.get(`${c.id}:${otherId}`)?.last_delivered_message_id ?? null,
        counterpartLastReadAt: seenHidden
          ? null
          : (partOf.get(`${c.id}:${otherId}`)?.last_read_at ?? null),
        kind: c.case_id ? 'case' : 'direct',
        requestStatus: c.request_status,
        requestedByMe: c.requested_by === viewerId,
        blocked: blockedIds.has(otherId),
        updatedAt: c.updated_at,
        ...(() => {
          const me = partOf.get(`${c.id}:${viewerId}`);
          return {
            folder: me?.folder ?? (c.case_id ? 'primary' : 'general'),
            folderAuto: !me?.folder,
            waitingSince: me?.waiting_since ?? null,
            note: me?.note ?? null,
            pinnedAt: me?.pinned_at ?? null,
            markedUnread: me?.marked_unread_at != null,
          };
        })(),
      });
    }
    return out;
  }
}

/** OQ-047: links of a page's voice notes and attachments. */
interface MediaLinks {
  /** Item 25: links to the ciphertext of encrypted chat files. */
  blobs?: Map<string, { url: string | null }>;
  extras?: MessageExtras;
  /** M3: chat files still being checked, or removed, by file id. */
  unscanned?: {
    attachments: Map<string, UnscannedChatFile>;
    voice: Map<string, UnscannedChatFile>;
  };
  voice: Map<string, { url: string; m4aUrl: string | null }>;
  stickers: Map<string, StickerDto>;
  attachments: Awaited<ReturnType<FilesService['attachmentUrls']>>;
  contacts: Map<string, ContactCardDto>;
  posts: Map<string, SharedPostCardDto>;
}

/** A display name: no path, no control characters, ≤200 chars. */
function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'file').slice(0, 200);
}

/** The two slots of a direct chat between [me] and [other], or null when
 * that pair cannot have one (self, or a role without chats). */
function directPair(
  me: string,
  myRole: string | null | undefined,
  other: string,
  otherRole: string | null | undefined,
): {
  attorney_id: string;
  client_id: string;
  pair_kind: ChatPairKind;
} | null {
  if (me === other) return null;
  const roles = ['client', 'attorney'];
  if (!roles.includes(myRole ?? '') || !roles.includes(otherRole ?? '')) {
    return null;
  }
  if (myRole !== otherRole) {
    return myRole === 'attorney'
      ? { attorney_id: me, client_id: other, pair_kind: 'attorney_client' }
      : { attorney_id: other, client_id: me, pair_kind: 'attorney_client' };
  }
  const [a, b] = me < other ? [me, other] : [other, me];
  return {
    attorney_id: a,
    client_id: b,
    pair_kind: myRole === 'client' ? 'client_client' : 'attorney_attorney',
  };
}
