import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BlocksService } from '../blocks/blocks.service';
import { maskContactInfo } from '../cases/cases.public';
import { FeatureFlagsService } from '../feature-flags/feature-flags.public';
import { FilesService } from '../files/files.service';
import { SearchSynonymsService } from '../search/search-synonyms.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  type AnswerDto,
  type AskQuestionDto,
  type QaPersonDto,
  type QaSummaryDto,
  type QuestionDetailDto,
  type QuestionDto,
  type QuestionPage,
  type QuestionsQueryDto,
} from './legal-qa.dto';

const PAGE = 20;

/** Owner 2026-10-21: one question takes at most this many attorney answers. */
export const MAX_ANSWERS = 10;
const QUESTION_INCLUDE = {
  practice_area: {
    select: { id: true, code: true, i18n_key: true, name_en: true },
  },
  state: { select: { code: true, name: true } },
} satisfies Prisma.LegalQuestionInclude;

type QuestionRow = Prisma.LegalQuestionGetPayload<{
  include: typeof QUESTION_INCLUDE;
}>;
type AnswerRow = Prisma.LegalAnswerGetPayload<object>;

function fullName(u: {
  first_name: string | null;
  last_name: string | null;
}): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ');
}

/**
 * Owner 2026-10-20: «Вопрос юристу». A client asks a public question
 * (optionally anonymous); only verified attorneys answer; the author marks
 * the best answer; anyone likes an answer. Contacts in the text are masked
 * like in a pre-agreement chat — this is a public page. Reports and the
 * moderation queue are the existing ones (`legal_question`, `legal_answer`).
 */
@Injectable()
export class LegalQaService {
  private readonly log = new Logger(LegalQaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly flags: FeatureFlagsService,
    private readonly limits: UsageLimitsService,
    private readonly settings: AppSettingsService,
    private readonly blocks: BlocksService,
    private readonly files: FilesService,
    private readonly synonyms: SearchSynonymsService,
  ) {}

  // --- questions ------------------------------------------------------------

  /**
   * Owner 2026-10-20: the same kinds of match as the main search — whole
   * words (full text, accents ignored), typos (trigram word similarity on
   * the title), plain substrings, and the topic the query's synonyms point
   * at — over the title, the text and every published answer.
   */
  private async searchIds(text: string): Promise<string[]> {
    const topics = (await this.synonyms.resolve(text)).practiceIds;
    const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT q.id::TEXT AS id
      FROM legal_questions q
      WHERE q.status = 'published' AND q.deleted_at IS NULL
        AND (
          to_tsvector('simple', f_unaccent(q.title || ' ' || q.body))
            @@ websearch_to_tsquery('simple', f_unaccent(${text}))
          OR word_similarity(f_unaccent(lower(${text})), f_unaccent(lower(q.title))) > 0.45
          OR q.title ILIKE ${like} OR q.body ILIKE ${like}
          OR (${topics.length > 0} AND q.practice_area_id = ANY(${topics}::UUID[]))
          OR EXISTS (
            SELECT 1 FROM legal_answers a
            WHERE a.question_id = q.id AND a.status = 'published'
              AND a.deleted_at IS NULL
              AND (to_tsvector('simple', f_unaccent(a.body))
                     @@ websearch_to_tsquery('simple', f_unaccent(${text}))
                   OR a.body ILIKE ${like}))
        )
      ORDER BY q.created_at DESC
      LIMIT 500`;
    return rows.map((r) => r.id);
  }

  async list(user: RequestUser, q: QuestionsQueryDto): Promise<QuestionPage> {
    await this.assertEnabled();
    const limit = q.limit ?? PAGE;
    const filter = q.filter ?? 'all';
    const hidden = [...(await this.blocks.hiddenIds(user.sub))];
    const where: Prisma.LegalQuestionWhereInput[] = [];
    if (filter === 'mine') {
      where.push(
        user.role === 'attorney'
          ? {
              answers: { some: { attorney_id: user.sub, status: 'published' } },
            }
          : { author_id: user.sub },
      );
      // Own questions are shown whatever their status, except removed ones.
      if (user.role !== 'attorney') {
        where.push({ status: { in: ['published', 'hidden'] } });
      } else {
        where.push({ status: 'published' });
      }
    } else {
      where.push({ status: 'published' });
      if (hidden.length > 0) where.push({ author_id: { notIn: hidden } });
      // A closed question stays in its author's own feed only.
      where.push({
        OR: [{ closed_at: null }, { author_id: user.sub }],
      });
    }
    if (filter === 'unanswered') where.push({ answer_count: 0 });
    if (filter === 'solved') where.push({ best_answer_id: { not: null } });
    if (q.scope === 'mine' && filter !== 'mine') {
      const mine = await this.myPracticeWhere(user);
      if (mine) where.push(mine);
    }
    if (q.stateCode) where.push({ state_code: q.stateCode });
    if (q.practiceAreaId) {
      where.push({
        practice_area_id: {
          in: await this.areaFamily(q.practiceAreaId),
        },
      });
    }
    const text = q.q?.trim();
    if (text) where.push({ id: { in: await this.searchIds(text) } });
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      where.push({
        OR: [
          { created_at: { lt: c.createdAt } },
          { created_at: c.createdAt, id: { lt: c.id } },
        ],
      });
    }
    const rows = await this.prisma.legalQuestion.findMany({
      where: { AND: where },
      include: QUESTION_INCLUDE,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.presentQuestions(page, user),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async get(user: RequestUser, id: string): Promise<QuestionDetailDto> {
    await this.assertEnabled();
    const row = await this.loadVisible(user, id);
    const [question] = await this.presentQuestions([row], user);
    const hidden = await this.blocks.hiddenIds(user.sub);
    const answers = await this.prisma.legalAnswer.findMany({
      where: { question_id: id, status: 'published' },
      orderBy: [
        { is_best: 'desc' },
        { like_count: 'desc' },
        { created_at: 'asc' },
      ],
    });
    // Owner 2026-10-21: an attorney sees only their own answer, so nobody
    // copies a colleague; every client sees all of them (and likes them).
    const visible = answers.filter((a) =>
      user.role === 'attorney'
        ? a.attorney_id === user.sub
        : !hidden.has(a.attorney_id),
    );
    return { ...question, answers: await this.presentAnswers(visible, user) };
  }

  async ask(user: RequestUser, dto: AskQuestionDto): Promise<QuestionDto> {
    await this.assertEnabled();
    if (user.role !== 'client' || user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only a client asks a question.',
      });
    }
    if (dto.practiceAreaId) await this.assertArea(dto.practiceAreaId);
    if (dto.stateCode) await this.assertState(dto.stateCode);
    if (dto.anonymous && !(await this.settings.boolean('qa.allow_anonymous'))) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Anonymous questions are switched off.',
      });
    }
    await this.limits.consume('question_create', user.sub);
    const row = await this.prisma.legalQuestion.create({
      data: {
        author_id: user.sub,
        practice_area_id: dto.practiceAreaId ?? null,
        state_code: dto.stateCode ?? null,
        title: maskContactInfo(dto.title).text,
        body: maskContactInfo(dto.body).text,
        is_anonymous: dto.anonymous ?? false,
      },
      include: QUESTION_INCLUDE,
    });
    this.later(() => this.alertAttorneys(row));
    return (await this.presentQuestions([row], user))[0];
  }

  async remove(user: RequestUser, id: string): Promise<void> {
    const row = await this.prisma.legalQuestion.findFirst({
      where: { id, author_id: user.sub },
      select: { id: true },
    });
    if (!row) throw this.notFound();
    await this.prisma.legalQuestion.update({
      where: { id },
      data: { status: 'removed', deleted_at: new Date() },
    });
  }

  /** The author closes the question: attorneys no longer see or answer it. */
  async close(user: RequestUser, id: string): Promise<void> {
    const r = await this.prisma.legalQuestion.updateMany({
      where: { id, author_id: user.sub, deleted_at: null, closed_at: null },
      data: { closed_at: new Date() },
    });
    if (r.count === 0) {
      const own = await this.prisma.legalQuestion.findFirst({
        where: { id, author_id: user.sub, deleted_at: null },
        select: { id: true },
      });
      if (!own) throw this.notFound();
    }
  }

  private closed(): ConflictException {
    return new ConflictException({
      code: ErrorCode.QA_QUESTION_CLOSED,
      message: 'The question is closed.',
    });
  }

  // --- answers ----------------------------------------------------------------

  async answer(
    user: RequestUser,
    id: string,
    body: string,
  ): Promise<AnswerDto> {
    await this.assertEnabled();
    await this.assertVerifiedAttorney(user);
    const q = await this.loadVisible(user, id);
    if (q.author_id === user.sub) throw this.forbidden();
    if (q.closed_at) throw this.closed();
    await this.blocks.assertNotBlocked(user.sub, q.author_id);
    if (
      q.answer_count >= MAX_ANSWERS &&
      !(await this.hasLiveAnswer(id, user.sub))
    )
      throw this.answersEnough();
    await this.limits.consume('answer_create', user.sub);
    const text = maskContactInfo(body).text;
    let announce = false;
    const row = await withTxRetry(this.prisma, async (tx) => {
      announce = false;
      const existing = await tx.legalAnswer.findFirst({
        where: withDeleted({ question_id: id, attorney_id: user.sub }),
      });
      if (!existing) {
        await this.takeSlot(tx, id);
        const created = await tx.legalAnswer.create({
          data: { question_id: id, attorney_id: user.sub, body: text },
        });
        announce = true;
        return created;
      }
      // Hidden or removed by a moderator: the attorney cannot bring it back
      // (own deletion also sets deleted_at, and may be posted again).
      if (
        existing.status === 'hidden' ||
        (existing.status === 'removed' && !existing.deleted_at)
      ) {
        throw this.forbidden();
      }
      const wasLive = existing.status === 'published' && !existing.deleted_at;
      const updated = await tx.legalAnswer.update({
        where: { id: existing.id },
        data: { body: text, status: 'published', deleted_at: null },
      });
      if (!wasLive) {
        await this.takeSlot(tx, id);
        announce = true;
      }
      return updated;
    });
    if (announce) {
      await this.notifications.emit({
        type: 'legal_answer_update',
        recipientId: q.author_id,
        payload: { kind: 'answered', questionId: id, actorId: user.sub },
      });
    }
    return (await this.presentAnswers([row], user))[0];
  }

  async removeAnswer(user: RequestUser, id: string): Promise<void> {
    await withTxRetry(this.prisma, async (tx) => {
      const a = await tx.legalAnswer.findFirst({
        where: { question_id: id, attorney_id: user.sub },
      });
      if (!a) throw this.notFound();
      await tx.legalAnswer.update({
        where: { id: a.id },
        data: { status: 'removed', deleted_at: new Date(), is_best: false },
      });
      await tx.legalQuestion.updateMany({
        where: withDeleted({ id }),
        data: { answer_count: { decrement: a.status === 'published' ? 1 : 0 } },
      });
      await tx.legalQuestion.updateMany({
        where: withDeleted({ id, best_answer_id: a.id }),
        data: { best_answer_id: null },
      });
    });
  }

  async like(
    user: RequestUser,
    id: string,
    answerId: string,
  ): Promise<AnswerDto> {
    // Owner 2026-10-21: attorneys do not see each other's answers, so only
    // clients like them.
    if (user.role === 'attorney') throw this.forbidden();
    const a = await this.publishedAnswer(user, id, answerId);
    if (a.attorney_id === user.sub) throw this.forbidden();
    await this.blocks.assertNotBlocked(user.sub, a.attorney_id);
    return this.setLike(user, a, true);
  }

  async unlike(
    user: RequestUser,
    id: string,
    answerId: string,
  ): Promise<AnswerDto> {
    const a = await this.publishedAnswer(user, id, answerId);
    return this.setLike(user, a, false);
  }

  private async setLike(
    user: RequestUser,
    a: AnswerRow,
    on: boolean,
  ): Promise<AnswerDto> {
    const row = await withTxRetry(this.prisma, async (tx) => {
      if (on) {
        await tx.legalAnswerLike.createMany({
          data: [{ answer_id: a.id, user_id: user.sub }],
          skipDuplicates: true,
        });
      } else {
        await tx.legalAnswerLike.deleteMany({
          where: { answer_id: a.id, user_id: user.sub },
        });
      }
      const count = await tx.legalAnswerLike.count({
        where: { answer_id: a.id },
      });
      return tx.legalAnswer.update({
        where: { id: a.id },
        data: { like_count: count },
      });
    });
    return (await this.presentAnswers([row], user))[0];
  }

  /** The author marks one answer as the best (the previous mark moves). */
  async markBest(
    user: RequestUser,
    id: string,
    answerId: string,
  ): Promise<QuestionDetailDto> {
    const q = await this.loadVisible(user, id);
    if (q.author_id !== user.sub) throw this.forbidden();
    const a = await this.publishedAnswer(user, id, answerId);
    let notify = false;
    await withTxRetry(this.prisma, async (tx) => {
      notify = q.best_answer_id !== a.id;
      await tx.legalAnswer.updateMany({
        where: { question_id: id, is_best: true },
        data: { is_best: false },
      });
      await tx.legalAnswer.update({
        where: { id: a.id },
        data: { is_best: true },
      });
      await tx.legalQuestion.update({
        where: { id },
        data: { best_answer_id: a.id },
      });
    });
    if (notify) {
      await this.notifications.emit({
        type: 'legal_answer_update',
        recipientId: a.attorney_id,
        payload: { kind: 'best', questionId: id, actorId: user.sub },
      });
    }
    return this.get(user, id);
  }

  async clearBest(user: RequestUser, id: string): Promise<QuestionDetailDto> {
    const q = await this.loadVisible(user, id);
    if (q.author_id !== user.sub) throw this.forbidden();
    await withTxRetry(this.prisma, async (tx) => {
      await tx.legalAnswer.updateMany({
        where: { question_id: id, is_best: true },
        data: { is_best: false },
      });
      await tx.legalQuestion.update({
        where: { id },
        data: { best_answer_id: null },
      });
    });
    return this.get(user, id);
  }

  // --- alerts -----------------------------------------------------------------

  /**
   * A new question reaches the verified attorneys of its practice area (and
   * state) who turned on «Новые кейсы»: their alert practices are the same
   * ones the case alerts use. Blocks either way are skipped.
   */
  async summary(user: RequestUser): Promise<QaSummaryDto> {
    // Owner 2026-10-20: how often and from how many the card shows is set
    // in the admin (Настройки).
    const [
      bannerEnabled,
      bannerIntervalHours,
      bannerMinNew,
      profileCtaEnabled,
    ] = await Promise.all([
      this.settings.boolean('qa.banner_enabled'),
      this.settings.number('qa.banner_interval_hours'),
      this.settings.number('qa.banner_min_new'),
      this.settings.boolean('qa.profile_cta_enabled'),
    ]);
    const base = {
      bannerEnabled,
      bannerIntervalHours,
      bannerMinNew,
      profileCtaEnabled,
    };
    if (user.role !== 'attorney' || user.assistant)
      return { newCount: 0, ...base };
    if (!(await this.flags.isEnabled('legal_qa', true)))
      return { newCount: 0, ...base };
    const [row] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::INT AS n
      FROM legal_questions q
      WHERE q.status = 'published' AND q.deleted_at IS NULL
        AND q.answer_count = 0
        AND q.closed_at IS NULL
        AND q.created_at > now() - interval '24 hours'
        AND q.author_id <> ${user.sub}::UUID
        AND (q.state_code IS NULL OR EXISTS (
          SELECT 1 FROM attorney_licenses l
          WHERE l.attorney_id = ${user.sub}::UUID
            AND l.state_code = q.state_code
            AND l.license_status = 'verified'))
        AND (q.practice_area_id IS NULL OR EXISTS (
          SELECT 1 FROM attorney_practice_areas ap
          JOIN practice_areas qa ON qa.id = q.practice_area_id
          WHERE ap.attorney_id = ${user.sub}::UUID
            AND (ap.practice_area_id = qa.id
              OR ap.practice_area_id = qa.parent_id
              OR ap.practice_area_id IN (
                   SELECT c.id FROM practice_areas c WHERE c.parent_id = qa.id))))
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ${user.sub}::UUID AND b.blocked_id = q.author_id)
             OR (b.blocker_id = q.author_id AND b.blocked_id = ${user.sub}::UUID))`;
    return { newCount: row?.n ?? 0, ...base };
  }

  async alertAttorneys(
    q: Pick<
      QuestionRow,
      'id' | 'author_id' | 'practice_area_id' | 'state_code'
    >,
  ): Promise<number> {
    if (!q.practice_area_id) return 0;
    // Owner 2026-10-20: no push about new questions unless switched on.
    if (!(await this.settings.boolean('qa.push_attorneys'))) return 0;
    const max = await this.settings.number('qa.alert_max_attorneys');
    const stateFilter = q.state_code
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM attorney_licenses l
          WHERE l.attorney_id = ch.attorney_id
            AND l.state_code = ${q.state_code}
            AND l.license_status = 'verified')`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH qa AS (
        SELECT pa.id, pa.parent_id FROM practice_areas pa
        WHERE pa.id = ${q.practice_area_id}::UUID
      ), chosen AS (
        SELECT ap.attorney_id, ap.practice_area_id
        FROM attorney_practice_areas ap
        JOIN attorney_profiles p ON p.user_id = ap.attorney_id
         AND NOT p.new_case_alerts_custom
        UNION ALL
        SELECT n.attorney_id, n.practice_area_id
        FROM new_case_alert_practices n
        JOIN attorney_profiles p ON p.user_id = n.attorney_id
         AND p.new_case_alerts_custom
      )
      SELECT DISTINCT ch.attorney_id::TEXT AS id
      FROM qa
      JOIN chosen ch ON ch.practice_area_id = qa.id
                     OR ch.practice_area_id = qa.parent_id
                     OR ch.practice_area_id IN (
                       SELECT c.id FROM practice_areas c WHERE c.parent_id = qa.id)
      JOIN attorney_profiles p ON p.user_id = ch.attorney_id
       AND p.verification_status = 'verified'
      JOIN notification_settings s
        ON s.user_id = ch.attorney_id AND s.category = 'new_cases'
       AND s.push_enabled
      JOIN users u ON u.id = ch.attorney_id
       AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE ch.attorney_id <> ${q.author_id}::UUID
        ${stateFilter}
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = ch.attorney_id AND b.blocked_id = ${q.author_id}::UUID)
             OR (b.blocker_id = ${q.author_id}::UUID AND b.blocked_id = ch.attorney_id))
      LIMIT ${max}`;
    for (const r of rows) {
      await this.notifications.emit({
        type: 'legal_question_new',
        recipientId: r.id,
        payload: { questionId: q.id },
      });
    }
    return rows.length;
  }

  // --- presenting -------------------------------------------------------------

  private async presentQuestions(
    rows: QuestionRow[],
    user: RequestUser,
  ): Promise<QuestionDto[]> {
    if (rows.length === 0) return [];
    const verified = await this.isVerifiedAttorney(user);
    const people = await this.people(
      rows
        .filter((r) => !r.is_anonymous || r.author_id === user.sub)
        .map((r) => r.author_id),
    );
    const mine = new Map<string, string>();
    if (verified) {
      const answers = await this.prisma.legalAnswer.findMany({
        where: {
          attorney_id: user.sub,
          question_id: { in: rows.map((r) => r.id) },
          status: 'published',
        },
        select: { id: true, question_id: true },
      });
      for (const a of answers) mine.set(a.question_id, a.id);
    }
    return rows.map((r) => {
      const isMine = r.author_id === user.sub;
      return {
        id: r.id,
        title: r.title,
        body: r.body,
        practiceArea: r.practice_area
          ? {
              id: r.practice_area.id,
              code: r.practice_area.code,
              i18nKey: r.practice_area.i18n_key,
              nameEn: r.practice_area.name_en,
            }
          : null,
        state: r.state ? { code: r.state.code, name: r.state.name } : null,
        isAnonymous: r.is_anonymous,
        author:
          r.is_anonymous && !isMine ? null : (people.get(r.author_id) ?? null),
        isMine,
        answerCount: r.answer_count,
        bestAnswerId: r.best_answer_id,
        myAnswerId: mine.get(r.id) ?? null,
        canAnswer:
          verified &&
          !isMine &&
          r.status === 'published' &&
          !r.closed_at &&
          !mine.has(r.id) &&
          (r.answer_count < MAX_ANSWERS || mine.has(r.id)),
        closed: r.closed_at !== null,
        answersEnough: r.answer_count >= MAX_ANSWERS,
        createdAt: r.created_at.toISOString(),
      };
    });
  }

  private async presentAnswers(
    rows: AnswerRow[],
    user: RequestUser,
  ): Promise<AnswerDto[]> {
    if (rows.length === 0) return [];
    const people = await this.people(rows.map((a) => a.attorney_id));
    const liked = new Set(
      (
        await this.prisma.legalAnswerLike.findMany({
          where: {
            user_id: user.sub,
            answer_id: { in: rows.map((a) => a.id) },
          },
          select: { answer_id: true },
        })
      ).map((l) => l.answer_id),
    );
    return rows.map((a) => ({
      id: a.id,
      questionId: a.question_id,
      attorney: people.get(a.attorney_id) ?? {
        id: a.attorney_id,
        displayName: '',
        username: null,
        avatarUrl: null,
      },
      body: a.body,
      likeCount: a.like_count,
      likedByMe: liked.has(a.id),
      isBest: a.is_best,
      isMine: a.attorney_id === user.sub,
      createdAt: a.created_at.toISOString(),
      updatedAt: a.updated_at.toISOString(),
    }));
  }

  private async people(ids: string[]): Promise<Map<string, QaPersonDto>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
        attorney_profile: { select: { username: true } },
        client_profile: { select: { username: true } },
      },
    });
    const avatars = await this.files.avatarUrlsMany(
      users.map((u) => u.avatar_file_id),
    );
    return new Map(
      users.map((u) => [
        u.id,
        {
          id: u.id,
          displayName: fullName(u),
          username:
            u.attorney_profile?.username ?? u.client_profile?.username ?? null,
          avatarUrl: u.avatar_file_id
            ? (avatars.get(u.avatar_file_id)?.url256 ?? null)
            : null,
        },
      ]),
    );
  }

  // --- guards -----------------------------------------------------------------

  private async assertEnabled(): Promise<void> {
    if (!(await this.flags.isEnabled('legal_qa', true))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: '«Ask a lawyer» is switched off.',
      });
    }
  }

  private async isVerifiedAttorney(user: RequestUser): Promise<boolean> {
    if (user.role !== 'attorney' || user.assistant) return false;
    const p = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: user.sub },
      select: { verification_status: true },
    });
    return p?.verification_status === 'verified';
  }

  private async assertVerifiedAttorney(user: RequestUser): Promise<void> {
    if (user.role !== 'attorney' || user.assistant) throw this.forbidden();
    if (!(await this.isVerifiedAttorney(user))) {
      throw new ForbiddenException({
        code: ErrorCode.ATTORNEY_NOT_VERIFIED,
        message: 'Only a verified attorney answers.',
      });
    }
  }

  /** A published question the viewer may see (own ones also when hidden). */
  private async loadVisible(
    user: RequestUser,
    id: string,
  ): Promise<QuestionRow> {
    const row = await this.prisma.legalQuestion.findFirst({
      where: { id },
      include: QUESTION_INCLUDE,
    });
    if (
      !row ||
      (row.status !== 'published' && row.author_id !== user.sub) ||
      row.status === 'removed'
    ) {
      throw this.notFound();
    }
    if (row.author_id !== user.sub) {
      const hidden = await this.blocks.hiddenIds(user.sub);
      if (hidden.has(row.author_id)) throw this.notFound();
    }
    return row;
  }

  private async publishedAnswer(
    user: RequestUser,
    questionId: string,
    answerId: string,
  ): Promise<AnswerRow> {
    await this.loadVisible(user, questionId);
    const a = await this.prisma.legalAnswer.findFirst({
      where: { id: answerId, question_id: questionId, status: 'published' },
    });
    if (!a) throw this.notFound();
    return a;
  }

  /** The area and everything below it (a category covers its topics). */
  /**
   * The attorney's own slice of the feed — the same rule as the fresh-count
   * card (`summary`): a question without an area or state is for everyone;
   * otherwise its area is one of mine, a parent or a child of one, and its
   * state is one where my licence is verified. Null when there is nothing to
   * narrow by (not an attorney, an assistant, no areas set).
   */
  private async myPracticeWhere(
    user: RequestUser,
  ): Promise<Prisma.LegalQuestionWhereInput | null> {
    if (user.role !== 'attorney' || user.assistant) return null;
    const mine = await this.prisma.attorneyPracticeArea.findMany({
      where: { attorney_id: user.sub },
      select: { practice_area_id: true },
    });
    if (mine.length === 0) return null;
    const ids = mine.map((m) => m.practice_area_id);
    const related = await this.prisma.practiceArea.findMany({
      where: { OR: [{ id: { in: ids } }, { parent_id: { in: ids } }] },
      select: { id: true, parent_id: true },
    });
    const areas = new Set<string>(ids);
    for (const r of related) {
      areas.add(r.id);
      if (ids.includes(r.id) && r.parent_id) areas.add(r.parent_id);
    }
    const licences = await this.prisma.attorneyLicense.findMany({
      where: { attorney_id: user.sub, license_status: 'verified' },
      select: { state_code: true },
    });
    const states = licences.map((l) => l.state_code);
    return {
      AND: [
        {
          OR: [
            { practice_area_id: null },
            { practice_area_id: { in: [...areas] } },
          ],
        },
        { OR: [{ state_code: null }, { state_code: { in: states } }] },
      ],
    };
  }

  /** Counts one more answer unless the question already has the maximum. */
  private async takeSlot(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const r = await tx.legalQuestion.updateMany({
      where: { id, answer_count: { lt: MAX_ANSWERS } },
      data: { answer_count: { increment: 1 } },
    });
    if (r.count === 0) throw this.answersEnough();
  }

  private async hasLiveAnswer(
    id: string,
    attorneyId: string,
  ): Promise<boolean> {
    const a = await this.prisma.legalAnswer.findFirst({
      where: { question_id: id, attorney_id: attorneyId, status: 'published' },
      select: { id: true },
    });
    return a !== null;
  }

  private answersEnough(): ConflictException {
    return new ConflictException({
      code: ErrorCode.QA_ANSWERS_ENOUGH,
      message: 'Enough answers.',
    });
  }

  private async areaFamily(id: string): Promise<string[]> {
    const rows = await this.prisma.practiceArea.findMany({
      where: { OR: [{ id }, { parent_id: id }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async assertArea(id: string): Promise<void> {
    const a = await this.prisma.practiceArea.findFirst({
      where: { id, is_active: true },
      select: { id: true },
    });
    if (!a) throw this.invalid('practiceAreaId');
  }

  private async assertState(code: string): Promise<void> {
    const s = await this.prisma.state.findFirst({
      where: { code, is_active: true },
      select: { code: true },
    });
    if (!s) throw this.invalid('stateCode');
  }

  private invalid(field: string): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Unknown value.',
      details: { field },
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Question not found.',
    });
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'Not allowed.',
    });
  }

  /** Runs [job] after the response without failing the request. */
  private later(job: () => Promise<unknown>): void {
    setImmediate(() => {
      job().catch((e: unknown) =>
        this.log.warn(`question alert fan-out failed: ${String(e)}`),
      );
    });
  }
}
