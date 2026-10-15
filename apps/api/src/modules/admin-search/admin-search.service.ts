import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  cleanTerm,
  SearchSynonymsService,
  uniqueTerms,
} from '../search/search-synonyms.service';
import type {
  ImportSynonymsDto,
  ImportSynonymsResultDto,
  SearchLearnedLinkDto,
  SearchOverviewDto,
  SearchQueryStatDto,
  SynonymGroupDto,
  SynonymGroupPageDto,
  SynonymTermDto,
  SynonymTestDto,
} from './admin-search.dto';

const PAGE = 40;

type GroupRow = Prisma.SearchSynonymGroupGetPayload<{
  include: { terms: true; practice_area: { select: { code: true } } };
}>;

function toDto(g: GroupRow): SynonymGroupDto {
  return {
    id: g.id,
    key: g.key,
    practiceCode: g.practice_area?.code ?? null,
    enabled: g.enabled,
    source: g.source,
    terms: g.terms
      .map((t) => ({ lang: t.lang, term: t.term }))
      .sort(
        (a, b) => a.lang.localeCompare(b.lang) || a.term.localeCompare(b.term),
      ),
  };
}

/** Owner 2026-10-15: «Синонимы поиска» in the admin — words per language
 * and topic, edited live; plus what people searched and did not find. */
@Injectable()
export class AdminSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly synonyms: SearchSynonymsService,
  ) {}

  async list(query: {
    q?: string;
    lang?: string;
    cursor?: string;
  }): Promise<SynonymGroupPageDto> {
    const q = query.q?.trim().toLowerCase();
    const and: Prisma.SearchSynonymGroupWhereInput[] = [];
    if (q) {
      and.push({
        OR: [
          { key: { contains: q } },
          { terms: { some: { term: { contains: q } } } },
        ],
      });
    }
    if (query.lang) {
      and.push({ terms: { some: { lang: query.lang.toLowerCase() } } });
    }
    const rows = await this.prisma.searchSynonymGroup.findMany({
      where: and.length ? { AND: and } : {},
      include: { terms: true, practice_area: { select: { code: true } } },
      orderBy: [{ key: 'asc' }, { id: 'asc' }],
      take: PAGE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor } } : {}),
    });
    const [total, terms] = await Promise.all([
      this.prisma.searchSynonymGroup.count(),
      this.prisma.searchSynonymTerm.count(),
    ]);
    return {
      items: rows.slice(0, PAGE).map(toDto),
      nextCursor: rows.length > PAGE ? rows[PAGE].id : null,
      total,
      terms,
    };
  }

  private async practiceId(
    code: string | null | undefined,
  ): Promise<string | null> {
    if (!code) return null;
    const p = await this.prisma.practiceArea.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!p) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `Unknown practice "${code}".`,
      });
    }
    return p.id;
  }

  private async get(id: string): Promise<GroupRow> {
    const g = await this.prisma.searchSynonymGroup.findUnique({
      where: { id },
      include: { terms: true, practice_area: { select: { code: true } } },
    });
    if (!g) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Group not found.',
      });
    }
    return g;
  }

  async create(dto: {
    key: string;
    practiceCode?: string;
    terms: SynonymTermDto[];
  }): Promise<SynonymGroupDto> {
    const practiceId = await this.practiceId(dto.practiceCode);
    try {
      const g = await this.prisma.searchSynonymGroup.create({
        data: {
          key: dto.key,
          practice_area_id: practiceId,
          source: 'admin',
          terms: { create: uniqueTerms(dto.terms) },
        },
        include: { terms: true, practice_area: { select: { code: true } } },
      });
      this.synonyms.invalidate();
      return toDto(g);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A group with this name already exists.',
        });
      }
      throw e;
    }
  }

  async update(
    id: string,
    dto: {
      practiceCode?: string | null;
      enabled?: boolean;
      terms?: SynonymTermDto[];
    },
  ): Promise<SynonymGroupDto> {
    await this.get(id);
    const practiceId =
      dto.practiceCode === undefined
        ? undefined
        : await this.practiceId(dto.practiceCode);
    await this.prisma.$transaction(async (tx) => {
      await tx.searchSynonymGroup.update({
        where: { id },
        data: {
          ...(practiceId !== undefined ? { practice_area_id: practiceId } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        },
      });
      if (dto.terms) {
        await tx.searchSynonymTerm.deleteMany({ where: { group_id: id } });
        await tx.searchSynonymTerm.createMany({
          data: uniqueTerms(dto.terms).map((t) => ({ ...t, group_id: id })),
          skipDuplicates: true,
        });
      }
    });
    this.synonyms.invalidate();
    return toDto(await this.get(id));
  }

  async addTerm(id: string, term: SynonymTermDto): Promise<SynonymGroupDto> {
    await this.get(id);
    const clean = cleanTerm(term);
    if (clean) {
      await this.prisma.searchSynonymTerm.createMany({
        data: [{ ...clean, group_id: id }],
        skipDuplicates: true,
      });
      this.synonyms.invalidate();
    }
    return toDto(await this.get(id));
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.prisma.searchSynonymGroup.delete({ where: { id } });
    this.synonyms.invalidate();
  }

  /** Bulk upsert (the 85-language file): groups by key, phrases added. */
  importGroups(dto: ImportSynonymsDto): Promise<ImportSynonymsResultDto> {
    return this.synonyms.importGroups(dto.groups, 'import');
  }

  /** "What would this search understand?" — for the admin's test box. */
  async test(q: string): Promise<SynonymTestDto> {
    this.synonyms.invalidate();
    const m = await this.synonyms.resolve(q);
    const codes = m.practiceIds.length
      ? await this.prisma.practiceArea.findMany({
          where: { id: { in: m.practiceIds } },
          select: { code: true },
          orderBy: { code: 'asc' },
        })
      : [];
    return { groupKeys: m.groupKeys, practiceCodes: codes.map((c) => c.code) };
  }

  private since(days: number): Date {
    return new Date(Date.now() - days * 24 * 3600 * 1000);
  }

  /** Queries that found nothing, the most frequent first. */
  noResults(days: number): Promise<SearchQueryStatDto[]> {
    return this.stats(days, true);
  }

  top(days: number): Promise<SearchQueryStatDto[]> {
    return this.stats(days, false);
  }

  private async stats(
    days: number,
    onlyEmpty: boolean,
  ): Promise<SearchQueryStatDto[]> {
    const rows = await this.prisma.$queryRaw<
      {
        q: string;
        n: bigint;
        people: bigint;
        scopes: string[];
        last_at: Date;
      }[]
    >`
      SELECT q, count(*) AS n, count(DISTINCT user_id) AS people,
             array_agg(DISTINCT scope) AS scopes, max(created_at) AS last_at
      FROM search_query_log
      WHERE created_at > ${this.since(days)}
        ${onlyEmpty ? Prisma.sql`AND results = 0` : Prisma.empty}
      GROUP BY q
      ORDER BY count(*) DESC, max(created_at) DESC
      LIMIT 100`;
    return rows.map((r) => ({
      q: r.q,
      count: Number(r.n),
      people: Number(r.people),
      scopes: r.scopes,
      lastAt: r.last_at.toISOString(),
    }));
  }

  async learned(): Promise<SearchLearnedLinkDto[]> {
    const rows = await this.prisma.searchLearnedLink.findMany({
      orderBy: [{ score: 'desc' }, { q: 'asc' }],
      take: 200,
    });
    const areas = await this.prisma.practiceArea.findMany({
      where: { id: { in: rows.map((r) => r.practice_area_id) } },
      select: { id: true, code: true },
    });
    const code = new Map(areas.map((a) => [a.id, a.code]));
    return rows.map((r) => ({
      q: r.q,
      practiceCode: code.get(r.practice_area_id) ?? '',
      score: r.score,
    }));
  }

  async overview(days: number): Promise<SearchOverviewDto> {
    const since = this.since(days);
    const [queries, noResults, clicks] = await Promise.all([
      this.prisma.searchQueryLog.count({
        where: { created_at: { gt: since } },
      }),
      this.prisma.searchQueryLog.count({
        where: { created_at: { gt: since }, results: 0 },
      }),
      this.prisma.searchClick.count({ where: { created_at: { gt: since } } }),
    ]);
    return { queries, noResults, clicks };
  }
}
