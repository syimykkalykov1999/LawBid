import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Experiment, ExperimentResult, Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type {
  CreateExperimentDto,
  ExperimentDto,
  ExperimentResultDto,
} from './admin-experiments.dto';
import {
  definitionProblem,
  normalizeGuardrails,
  parseVariants,
} from './experiment-definition';
import { ExperimentsNightlyJob } from './experiments-nightly.job';
import { ExperimentsService } from './experiments.service';

export const EXPERIMENT_AUDIT = {
  create: 'experiment.create',
  start: 'experiment.start',
  traffic: 'experiment.traffic',
  stop: 'experiment.stop',
} as const;

const bad = (message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message });
const stateError = (message: string) =>
  new ConflictException({ code: ErrorCode.EXPERIMENT_STATE_INVALID, message });

/** Admin side of experiments: create, start small, ramp, stop, read. */
@Injectable()
export class AdminExperimentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly settings: AppSettingsService,
    private readonly experiments: ExperimentsService,
    private readonly nightly: ExperimentsNightlyJob,
  ) {}

  async list(): Promise<ExperimentDto[]> {
    const rows = await this.prisma.experiment.findMany({
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      take: 100,
    });
    return Promise.all(rows.map((r) => this.present(r)));
  }

  async create(
    admin: AdminActor,
    dto: CreateExperimentDto,
  ): Promise<ExperimentDto> {
    const problem = definitionProblem({
      key: dto.key,
      variants: dto.variants,
      guardrails: dto.guardrails,
    });
    if (problem) throw bad(problem);
    if (dto.endAt && new Date(dto.endAt).getTime() <= Date.now()) {
      throw bad('Дата окончания уже прошла');
    }
    if (await this.prisma.experiment.findUnique({ where: { key: dto.key } })) {
      throw stateError('Тест с таким ключом уже есть');
    }
    const row = await this.prisma.experiment.create({
      data: {
        key: dto.key,
        name: dto.name.trim(),
        hypothesis: dto.hypothesis?.trim() || null,
        surface: dto.surface,
        status: 'draft',
        variants: dto.variants.map((v) => ({ key: v.key, weight: v.weight })),
        guardrails: normalizeGuardrails(
          dto.guardrails,
        ) as unknown as Prisma.InputJsonValue,
        end_at: dto.endAt ? new Date(dto.endAt) : null,
        created_by: admin.id,
      },
    });
    await this.audit.record({
      adminId: admin.id,
      action: EXPERIMENT_AUDIT.create,
      targetType: 'experiment',
      targetId: row.id,
      after: {
        key: row.key,
        variants: JSON.parse(JSON.stringify(dto.variants)) as unknown,
      },
      ip: admin.ip,
    });
    return this.present(row);
  }

  /** draft -> running, at 1..max_start_percent (5-10 by default). */
  async start(
    admin: AdminActor,
    id: string,
    percent: number,
  ): Promise<ExperimentDto> {
    const exp = await this.get(id);
    if (exp.status !== 'draft') {
      throw stateError(
        exp.status === 'running'
          ? 'Тест уже идёт'
          : 'Остановленный тест не запускают заново: создайте новый',
      );
    }
    const max = Math.round(
      await this.settings.number('experiments.max_start_percent'),
    );
    if (percent > max) {
      throw bad(
        `Начинать можно не больше чем с ${max}% людей; потом увеличьте долю отдельным шагом`,
      );
    }
    const row = await this.prisma.experiment.update({
      where: { id },
      data: {
        status: 'running',
        traffic_percent: percent,
        started_at: new Date(),
        start_at: new Date(),
      },
    });
    this.experiments.invalidate();
    await this.audit.record({
      adminId: admin.id,
      action: EXPERIMENT_AUDIT.start,
      targetType: 'experiment',
      targetId: id,
      after: { key: exp.key, trafficPercent: percent },
      ip: admin.ip,
    });
    return this.present(row);
  }

  /** Raise the share of a running test; refused while the last check is red. */
  async setTraffic(
    admin: AdminActor,
    id: string,
    percent: number,
  ): Promise<ExperimentDto> {
    const exp = await this.get(id);
    if (exp.status !== 'running')
      throw stateError('Долю меняют только у идущего теста');
    if (percent <= exp.traffic_percent) {
      throw bad(
        'Долю можно только увеличить; чтобы убрать тест, остановите его',
      );
    }
    const last = await this.latestResult(id);
    if (last?.srm_flag || last?.guardrail_tripped) {
      throw stateError(
        'Последняя проверка красная (неравное деление или защита): сначала разберитесь',
      );
    }
    const row = await this.prisma.experiment.update({
      where: { id },
      data: { traffic_percent: percent },
    });
    this.experiments.invalidate();
    await this.audit.record({
      adminId: admin.id,
      action: EXPERIMENT_AUDIT.traffic,
      targetType: 'experiment',
      targetId: id,
      before: { trafficPercent: exp.traffic_percent },
      after: { key: exp.key, trafficPercent: percent },
      ip: admin.ip,
    });
    return this.present(row);
  }

  /** Stop = rollback: everyone gets the default behaviour within seconds. */
  async stop(
    admin: AdminActor,
    id: string,
    reason?: string,
  ): Promise<ExperimentDto> {
    const exp = await this.get(id);
    if (exp.status !== 'running')
      throw stateError('Остановить можно только идущий тест');
    const row = await this.prisma.experiment.update({
      where: { id },
      data: {
        status: 'stopped',
        stopped_at: new Date(),
        stop_reason: (reason?.trim() || 'Остановлен администратором').slice(
          0,
          300,
        ),
        stopped_by_system: false,
      },
    });
    this.experiments.invalidate();
    await this.audit.record({
      adminId: admin.id,
      action: EXPERIMENT_AUDIT.stop,
      targetType: 'experiment',
      targetId: id,
      after: { key: exp.key, reason: row.stop_reason },
      ip: admin.ip,
    });
    return this.present(row);
  }

  /** Recompute the report now instead of waiting for the night. */
  async refresh(id: string): Promise<ExperimentDto> {
    const exp = await this.get(id);
    await this.nightly.computeNow(exp.id);
    return this.present(await this.get(id));
  }

  private async get(id: string): Promise<Experiment> {
    const row = await this.prisma.experiment.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Тест не найден',
      });
    return row;
  }

  private latestResult(id: string): Promise<ExperimentResult | null> {
    return this.prisma.experimentResult.findFirst({
      where: { experiment_id: id },
      orderBy: { computed_at: 'desc' },
    });
  }

  private async present(r: Experiment): Promise<ExperimentDto> {
    const [exposed, last] = await Promise.all([
      this.prisma.experimentExposure.count({ where: { experiment_id: r.id } }),
      this.latestResult(r.id),
    ]);
    const payload = (last?.payload ?? null) as { summary?: string[] } | null;
    const latest: ExperimentResultDto | null = last
      ? {
          computedAt: last.computed_at.toISOString(),
          srmP: last.srm_p,
          srmFlag: last.srm_flag,
          guardrailTripped: last.guardrail_tripped,
          summary: payload?.summary ?? [],
          report: (last.payload ?? {}) as Record<string, unknown>,
        }
      : null;
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      hypothesis: r.hypothesis,
      surface: r.surface,
      status: r.status,
      variants: parseVariants(r.variants),
      trafficPercent: r.traffic_percent,
      guardrails: normalizeGuardrails(r.guardrails as Record<string, number>),
      startedAt: r.started_at?.toISOString() ?? null,
      endAt: r.end_at?.toISOString() ?? null,
      stoppedAt: r.stopped_at?.toISOString() ?? null,
      stopReason: r.stop_reason,
      stoppedBySystem: r.stopped_by_system,
      exposed,
      latest,
    };
  }
}
