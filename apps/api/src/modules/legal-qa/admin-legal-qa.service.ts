import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withDeleted } from '../../prisma/soft-delete.extension';
import {
  type AdminQaListQueryDto,
  type AdminQaPage,
  type AdminQaQuestionDetailDto,
  type AdminQaQuestionDto,
} from './admin-legal-qa.dto';

const PAGE = 30;
const INCLUDE = {
  author: { select: { id: true, first_name: true, last_name: true } },
  practice_area: { select: { name_en: true } },
} satisfies Prisma.LegalQuestionInclude;
type Row = Prisma.LegalQuestionGetPayload<{ include: typeof INCLUDE }>;

function name(u: { first_name: string | null; last_name: string | null }) {
  return [u.first_name, u.last_name].filter(Boolean).join(' ');
}

/** Admin → «Вопрос юристу»: browse every question and answer (also hidden
 * and removed ones), and take a «best» mark off. Hide / remove / restore go
 * through the moderation actions (`/admin/moderation/targets/...`). */
@Injectable()
export class AdminLegalQaService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: AdminQaListQueryDto): Promise<AdminQaPage> {
    const limit = q.limit ?? PAGE;
    const status = q.status ?? 'all';
    const and: Prisma.LegalQuestionWhereInput[] = [];
    if (status === 'removed') {
      and.push({ OR: [{ status: 'removed' }, { deleted_at: { not: null } }] });
    } else if (status !== 'all') {
      and.push({ status, deleted_at: null });
    }
    if (q.q) {
      and.push({
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { body: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      and.push({
        OR: [
          { created_at: { lt: c.createdAt } },
          { created_at: c.createdAt, id: { lt: c.id } },
        ],
      });
    }
    const rows = await this.prisma.legalQuestion.findMany({
      where: withDeleted({ AND: and }),
      include: INCLUDE,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => this.present(r)),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async get(id: string): Promise<AdminQaQuestionDetailDto> {
    const row = await this.load(id);
    const answers = await this.prisma.legalAnswer.findMany({
      where: withDeleted({ question_id: id }),
      orderBy: [{ is_best: 'desc' }, { created_at: 'asc' }],
    });
    const people = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(answers.map((a) => a.attorney_id))] } },
      select: { id: true, first_name: true, last_name: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      ...this.present(row),
      answers: answers.map((a) => {
        const p = byId.get(a.attorney_id);
        return {
          id: a.id,
          body: a.body,
          status: a.deleted_at ? 'removed' : a.status,
          isBest: a.is_best,
          likeCount: a.like_count,
          attorney: { id: a.attorney_id, name: p ? name(p) : '' },
          createdAt: a.created_at.toISOString(),
        };
      }),
    };
  }

  /** Takes the «best answer» mark off (the author can mark again). */
  async clearBest(id: string): Promise<AdminQaQuestionDetailDto> {
    const row = await this.load(id);
    await this.prisma.$transaction([
      this.prisma.legalAnswer.updateMany({
        where: { question_id: row.id, is_best: true },
        data: { is_best: false },
      }),
      this.prisma.legalQuestion.update({
        where: { id: row.id },
        data: { best_answer_id: null },
      }),
    ]);
    return this.get(id);
  }

  private async load(id: string): Promise<Row> {
    const row = await this.prisma.legalQuestion.findFirst({
      where: withDeleted({ id }),
      include: INCLUDE,
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Question not found.',
      });
    }
    return row;
  }

  private present(r: Row): AdminQaQuestionDto {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      status: r.deleted_at ? 'removed' : r.status,
      isAnonymous: r.is_anonymous,
      answerCount: r.answer_count,
      bestAnswerId: r.best_answer_id,
      stateCode: r.state_code,
      practiceArea: r.practice_area?.name_en ?? null,
      author: { id: r.author.id, name: name(r.author) },
      createdAt: r.created_at.toISOString(),
    };
  }
}
