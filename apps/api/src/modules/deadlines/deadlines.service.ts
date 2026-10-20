import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CourtHoliday, DeadlineRule, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { parseIsoDate } from '../../common/utils/zoned-time';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.public';
import { computeDeadline } from './deadline-calc';
import {
  type AdminDeadlineRuleDto,
  type AdminHolidayDto,
  type AdminHolidaysQueryDto,
  type CreateDeadlineRuleDto,
  type CreateHolidayDto,
  type DeadlineCalcQueryDto,
  type DeadlineHolidayDto,
  type DeadlineHolidaysQueryDto,
  type DeadlineResultDto,
  type DeadlineRuleDto,
  type DeadlineRulesQueryDto,
  type GenerateFederalHolidaysResultDto,
  type UpdateDeadlineRuleDto,
} from './deadlines.dto';
import { federalHolidays } from './federal-holidays';

type Labels = Record<string, string>;

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const asLabels = (v: unknown): Labels =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Labels) : {};

function ruleDto(r: DeadlineRule): DeadlineRuleDto {
  return {
    id: r.id,
    jurisdiction: r.jurisdiction,
    kind: r.kind,
    code: r.code,
    labels: asLabels(r.labels),
    amount: r.amount,
    unit: r.unit,
    dayType: r.day_type,
    direction: r.direction,
    practiceCode: r.practice_code,
    citation: r.citation,
    notes: r.notes === null ? null : asLabels(r.notes),
    sourceUrl: r.source_url,
    verified: r.verified,
  };
}

function holidayDto(h: CourtHoliday): DeadlineHolidayDto {
  return { date: iso(h.date), names: asLabels(h.names) };
}

/**
 * Owner 2026-10-20: the deadline calculator. The rules and the courts'
 * holidays are reference data edited in the admin («Сроки»); the app only
 * counts. A result is an aid, never legal advice — the app says so and the
 * rule's «verified» flag tells whether staff checked it against the source.
 */
@Injectable()
export class DeadlinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  // --- the app ----------------------------------------------------------------

  async rules(q: DeadlineRulesQueryDto): Promise<DeadlineRuleDto[]> {
    await this.assertEnabled();
    const where: Prisma.DeadlineRuleWhereInput = { is_active: true };
    if (q.jurisdiction) where.jurisdiction = { in: ['US', q.jurisdiction] };
    if (q.kind) where.kind = q.kind;
    if (q.practiceCode) where.practice_code = q.practiceCode;
    const rows = await this.prisma.deadlineRule.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { sort: 'asc' }, { code: 'asc' }],
    });
    return rows.map(ruleDto);
  }

  async holidays(q: DeadlineHolidaysQueryDto): Promise<DeadlineHolidayDto[]> {
    await this.assertEnabled();
    const rows = await this.prisma.courtHoliday.findMany({
      where: {
        jurisdiction: { in: ['US', q.jurisdiction ?? 'US'] },
        date: {
          gte: new Date(Date.UTC(q.year, 0, 1)),
          lt: new Date(Date.UTC(q.year + 1, 0, 1)),
        },
      },
      orderBy: { date: 'asc' },
    });
    return rows.map(holidayDto);
  }

  async calculate(q: DeadlineCalcQueryDto): Promise<DeadlineResultDto> {
    await this.assertEnabled();
    const event = parseIsoDate(q.eventDate);
    if (!event || event.year < 1990 || event.year > 2100) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Bad date.',
        details: { field: 'eventDate' },
      });
    }
    const rule = await this.prisma.deadlineRule.findFirst({
      where: { code: q.ruleCode, is_active: true },
    });
    if (!rule) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Rule not found.',
      });
    }
    // A state's courts follow the federal holidays and their own.
    const jurisdictions = [...new Set(['US', rule.jurisdiction])];
    const rows = await this.prisma.courtHoliday.findMany({
      where: {
        jurisdiction: { in: jurisdictions },
        date: {
          gte: new Date(Date.UTC(event.year - 1, 0, 1)),
          lt: new Date(Date.UTC(event.year + 12, 0, 1)),
        },
      },
      orderBy: { date: 'asc' },
    });
    const dates = new Set(rows.map((h) => iso(h.date)));
    const result = computeDeadline(
      q.eventDate,
      {
        amount: rule.amount,
        unit: rule.unit,
        dayType: rule.day_type,
        direction: rule.direction,
      },
      dates,
    );
    const years = new Set(
      [q.eventDate, result.rawDate, result.dueDate].map((d) => d.slice(0, 4)),
    );
    const loaded = new Set(
      rows
        .filter((h) => h.jurisdiction === 'US')
        .map((h) => iso(h.date).slice(0, 4)),
    );
    const warnings: string[] = [];
    if ([...years].some((y) => !loaded.has(y)))
      warnings.push('holidays_missing');
    if (!rule.verified) warnings.push('unverified');
    if (result.rolled) warnings.push('rolled');
    const used = new Set(result.holidaysUsed);
    return {
      rule: ruleDto(rule),
      eventDate: q.eventDate,
      dueDate: result.dueDate,
      rawDate: result.rawDate,
      rolled: result.rolled,
      holidays: rows.filter((h) => used.has(iso(h.date))).map(holidayDto),
      warnings,
    };
  }

  // --- the admin ----------------------------------------------------------------

  async adminRules(): Promise<AdminDeadlineRuleDto[]> {
    const rows = await this.prisma.deadlineRule.findMany({
      orderBy: [{ jurisdiction: 'asc' }, { kind: 'asc' }, { sort: 'asc' }],
    });
    return rows.map((r) => ({
      ...ruleDto(r),
      isActive: r.is_active,
      sort: r.sort,
    }));
  }

  async createRule(dto: CreateDeadlineRuleDto): Promise<AdminDeadlineRuleDto> {
    this.assertLabels(dto.labels);
    if (dto.kind === 'statute_of_limitations' && !dto.practiceCode) {
      throw this.invalid(
        'practiceCode',
        'A statute needs a practice category.',
      );
    }
    if (
      await this.prisma.deadlineRule.findUnique({ where: { code: dto.code } })
    ) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A rule with this code exists.',
        details: { field: 'code' },
      });
    }
    await this.assertJurisdiction(dto.jurisdiction);
    const r = await this.prisma.deadlineRule.create({
      data: {
        jurisdiction: dto.jurisdiction,
        kind: dto.kind,
        code: dto.code,
        labels: dto.labels,
        amount: dto.amount,
        unit: dto.unit ?? 'day',
        day_type: dto.dayType ?? 'calendar',
        direction: dto.direction ?? 'after',
        practice_code: dto.practiceCode ?? null,
        citation: dto.citation ?? null,
        notes: dto.notes ?? undefined,
        source_url: dto.sourceUrl ?? null,
        verified: dto.verified ?? false,
        is_active: dto.isActive ?? true,
        sort: dto.sort ?? 0,
      },
    });
    return { ...ruleDto(r), isActive: r.is_active, sort: r.sort };
  }

  async updateRule(
    id: string,
    dto: UpdateDeadlineRuleDto,
  ): Promise<AdminDeadlineRuleDto> {
    if (dto.labels) this.assertLabels(dto.labels);
    const found = await this.prisma.deadlineRule.findUnique({ where: { id } });
    if (!found) throw this.notFound();
    const r = await this.prisma.deadlineRule.update({
      where: { id },
      data: {
        ...(dto.kind ? { kind: dto.kind } : {}),
        ...(dto.labels ? { labels: dto.labels } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.unit ? { unit: dto.unit } : {}),
        ...(dto.dayType ? { day_type: dto.dayType } : {}),
        ...(dto.direction ? { direction: dto.direction } : {}),
        ...(dto.practiceCode !== undefined
          ? { practice_code: dto.practiceCode || null }
          : {}),
        ...(dto.citation !== undefined
          ? { citation: dto.citation || null }
          : {}),
        ...(dto.notes ? { notes: dto.notes } : {}),
        ...(dto.sourceUrl !== undefined
          ? { source_url: dto.sourceUrl || null }
          : {}),
        ...(dto.verified !== undefined ? { verified: dto.verified } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
      },
    });
    return { ...ruleDto(r), isActive: r.is_active, sort: r.sort };
  }

  async deleteRule(id: string): Promise<void> {
    const { count } = await this.prisma.deadlineRule.deleteMany({
      where: { id },
    });
    if (count === 0) throw this.notFound();
  }

  async adminHolidays(q: AdminHolidaysQueryDto): Promise<AdminHolidayDto[]> {
    const where: Prisma.CourtHolidayWhereInput = {};
    if (q.jurisdiction) where.jurisdiction = q.jurisdiction;
    if (q.year) {
      where.date = {
        gte: new Date(Date.UTC(q.year, 0, 1)),
        lt: new Date(Date.UTC(q.year + 1, 0, 1)),
      };
    }
    const rows = await this.prisma.courtHoliday.findMany({
      where,
      orderBy: [{ date: 'asc' }, { jurisdiction: 'asc' }],
      take: 500,
    });
    return rows.map((h) => ({
      ...holidayDto(h),
      id: h.id,
      jurisdiction: h.jurisdiction,
    }));
  }

  async createHoliday(dto: CreateHolidayDto): Promise<AdminHolidayDto> {
    const d = parseIsoDate(dto.date);
    if (!d) throw this.invalid('date', 'Bad date.');
    this.assertLabels(dto.names);
    await this.assertJurisdiction(dto.jurisdiction);
    const date = new Date(Date.UTC(d.year, d.month - 1, d.day));
    const existing = await this.prisma.courtHoliday.findUnique({
      where: { jurisdiction_date: { jurisdiction: dto.jurisdiction, date } },
    });
    const h = existing
      ? await this.prisma.courtHoliday.update({
          where: { id: existing.id },
          data: { names: dto.names },
        })
      : await this.prisma.courtHoliday.create({
          data: { jurisdiction: dto.jurisdiction, date, names: dto.names },
        });
    return { ...holidayDto(h), id: h.id, jurisdiction: h.jurisdiction };
  }

  async deleteHoliday(id: string): Promise<void> {
    const { count } = await this.prisma.courtHoliday.deleteMany({
      where: { id },
    });
    if (count === 0) throw this.notFound();
  }

  /** The federal holidays of [year] (open data) — what is missing is added. */
  async generateFederal(
    year: number,
  ): Promise<GenerateFederalHolidaysResultDto> {
    let created = 0;
    let existing = 0;
    for (const h of federalHolidays(year)) {
      const [y, m, d] = h.date.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const found = await this.prisma.courtHoliday.findUnique({
        where: { jurisdiction_date: { jurisdiction: 'US', date } },
        select: { id: true },
      });
      if (found) {
        existing += 1;
        continue;
      }
      await this.prisma.courtHoliday.create({
        data: { jurisdiction: 'US', date, names: h.names },
      });
      created += 1;
    }
    return { created, existing };
  }

  // --- guards ---------------------------------------------------------------------

  private async assertEnabled(): Promise<void> {
    if (!(await this.flags.isEnabled('deadline_calculator', true))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'The deadline calculator is switched off.',
      });
    }
  }

  private assertLabels(v: Labels): void {
    const ok =
      v &&
      typeof v === 'object' &&
      typeof v.en === 'string' &&
      v.en.trim() !== '' &&
      Object.values(v).every((x) => typeof x === 'string' && x.length <= 400);
    if (!ok) throw this.invalid('labels', 'English text is required (≤400).');
  }

  private async assertJurisdiction(code: string): Promise<void> {
    if (code === 'US') return;
    const s = await this.prisma.state.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!s) throw this.invalid('jurisdiction', 'Unknown state.');
  }

  private invalid(field: string, message: string): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message,
      details: { field },
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Not found.',
    });
  }
}
