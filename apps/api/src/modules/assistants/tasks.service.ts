import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AttorneyTask, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssistantsService, nameOf } from './assistants.service';
import type {
  CreateTaskDto,
  TaskDto,
  TasksQueryDto,
  TaskStepInputDto,
  UpdateTaskStatusDto,
  UpdateTaskStepDto,
} from './assistants.dto';

/** Steps per task (CreateTaskDto caps the initial list the same way). */
const MAX_STEPS = 100;

/** Owner 2026-10-01: the step columns from the input. */
function stepData(s: TaskStepInputDto) {
  return {
    kind: s.kind ?? null,
    title: s.title,
    due_at: s.dueAt ? new Date(s.dueAt) : null,
    location: s.location ?? null,
    contact_name: s.contactName ?? null,
    contact_phone: s.contactPhone ?? null,
    contact_email: s.contactEmail ?? null,
  };
}

const INCLUDE = {
  case: { select: { title: true } },
  steps: { orderBy: [{ position: 'asc' }, { created_at: 'asc' }] },
  created_by: {
    select: {
      display_name: true,
      phone_e164: true,
      assistant_user: { select: { first_name: true, last_name: true } },
    },
  },
} satisfies Prisma.AttorneyTaskInclude;

type TaskRow = Prisma.AttorneyTaskGetPayload<{ include: typeof INCLUDE }>;

/**
 * Owner 2026-09-30 (OQ-048): "Tasks" — assistants (or the attorney) plan
 * calls, meetings, court dates, deadlines, documents to print, visits…
 * with a time, a place, a case, a contact and attached documents. The
 * attorney takes a task, marks it done or not done (with a note and a new
 * date to move it to); the assistant who set it is notified of the result.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly assistants: AssistantsService,
  ) {}

  private assertMayPlan(user: RequestUser): void {
    const a = user.assistant;
    if (a && !a.duties.includes('tasks')) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'The attorney has not given you this duty.',
        details: { duty: 'tasks' },
      });
    }
  }

  async create(user: RequestUser, dto: CreateTaskDto): Promise<TaskDto> {
    const a = user.assistant;
    this.assertMayPlan(user);
    const fileIds = dto.fileIds ?? [];
    for (const id of fileIds) {
      // The uploader is whoever is signed in (the assistant's files are
      // owned by the attorney account they act in).
      await this.files.assertAttachable(user.sub, id, ['task_attachment']);
    }
    const t = await this.prisma.attorneyTask.create({
      data: {
        attorney_id: user.sub,
        created_by_membership_id: a?.membershipId ?? null,
        kind: dto.kind,
        title: dto.title,
        notes: dto.notes ?? null,
        due_at: dto.dueAt ? new Date(dto.dueAt) : null,
        location: dto.location ?? null,
        case_id: dto.caseId ?? null,
        contact_name: dto.contactName ?? null,
        contact_phone: dto.contactPhone ?? null,
        contact_email: dto.contactEmail ?? null,
        file_ids: fileIds,
        steps: {
          create: (dto.steps ?? []).map((st, i) => ({
            ...stepData(st),
            position: i,
            created_by_name: a?.name ?? null,
          })),
        },
      },
      include: INCLUDE,
    });
    if (a) {
      await this.assistants.log(user, 'task.create', {
        type: 'task',
        id: t.id,
        summary: t.title,
      });
      await this.notifications.emit({
        type: 'assistant_task',
        recipientId: user.sub,
        payload: { taskId: t.id, kind: t.kind },
      });
    }
    return (await this.present([t]))[0];
  }

  async list(user: RequestUser, q: TasksQueryDto): Promise<TaskDto[]> {
    const view = q.view ?? 'active';
    const rows = await this.prisma.attorneyTask.findMany({
      where: {
        attorney_id: user.sub,
        ...(q.mine && user.assistant
          ? { created_by_membership_id: user.assistant.membershipId }
          : {}),
        ...(view === 'active'
          ? { status: { in: ['open', 'taken'] } }
          : view === 'done'
            ? { status: { in: ['done', 'not_done', 'cancelled'] } }
            : {}),
        ...(q.from || q.to
          ? {
              due_at: {
                ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
                ...(q.to ? { lte: new Date(`${q.to}T23:59:59Z`) } : {}),
              },
            }
          : {}),
      },
      orderBy:
        view === 'active'
          ? [{ due_at: { sort: 'asc', nulls: 'last' } }, { created_at: 'asc' }]
          : [{ updated_at: 'desc' }],
      take: 300,
      include: INCLUDE,
    });
    return this.present(rows);
  }

  async get(user: RequestUser, id: string): Promise<TaskDto> {
    return (await this.present([await this.own(user, id)]))[0];
  }

  /**
   * The attorney moves a task: taken → done / not done (+ note, + a new
   * time — the task then stays open at that time), or cancels it.
   * Assistants may only cancel their own tasks.
   */
  async setStatus(
    user: RequestUser,
    id: string,
    dto: UpdateTaskStatusDto,
  ): Promise<TaskDto> {
    const t = await this.own(user, id);
    const a = user.assistant;
    if (
      a &&
      !(
        dto.status === 'cancelled' &&
        t.created_by_membership_id === a.membershipId
      )
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'Only the attorney completes tasks.',
      });
    }
    const reschedule =
      dto.status === 'not_done' && dto.rescheduleTo
        ? new Date(dto.rescheduleTo)
        : null;
    const updated = await this.prisma.attorneyTask.update({
      where: { id },
      data: {
        // A moved task stays open at its new time.
        status: reschedule ? 'open' : dto.status,
        outcome_note: dto.outcomeNote ?? t.outcome_note,
        ...(reschedule
          ? { rescheduled_to: reschedule, due_at: reschedule }
          : {}),
        done_at:
          dto.status === 'done' || dto.status === 'not_done'
            ? new Date()
            : null,
      },
      include: INCLUDE,
    });
    if (a) {
      await this.assistants.log(user, `task.${dto.status}`, {
        type: 'task',
        id,
        summary: t.title,
      });
    } else if (dto.status !== 'open') {
      await this.assistants.tellAssistant(t.created_by_membership_id, {
        taskId: id,
        status: updated.status,
        ...(reschedule ? { rescheduledTo: reschedule.toISOString() } : {}),
      });
    }
    return (await this.present([updated]))[0];
  }

  /**
   * Owner 2026-10-01: add a step to a task's checklist — the attorney or
   * an assistant with the tasks duty. A finished task opens again.
   */
  async addStep(
    user: RequestUser,
    id: string,
    dto: TaskStepInputDto,
  ): Promise<TaskDto> {
    this.assertMayPlan(user);
    const t = await this.own(user, id);
    if (t.status === 'cancelled') throw this.closed();
    // Same technical cap as on creation (security audit 2026-10-01).
    if (t.steps.length >= MAX_STEPS) {
      throw new ConflictException({
        code: ErrorCode.TASK_CLOSED,
        message: `A task holds up to ${MAX_STEPS} steps.`,
        details: { max: MAX_STEPS },
      });
    }
    const last = t.steps.at(-1)?.position ?? -1;
    await this.prisma.$transaction([
      this.prisma.attorneyTaskStep.create({
        data: {
          ...stepData(dto),
          task_id: id,
          position: last + 1,
          created_by_name: user.assistant?.name ?? null,
        },
      }),
      ...(t.status === 'done' || t.status === 'not_done'
        ? [
            this.prisma.attorneyTask.update({
              where: { id },
              data: { status: 'open', done_at: null },
            }),
          ]
        : []),
    ]);
    if (user.assistant) {
      await this.assistants.log(user, 'task.step.add', {
        type: 'task',
        id,
        summary: `${t.title} · ${dto.title}`,
      });
    }
    return this.get(user, id);
  }

  /**
   * Check a step off (done / not done / open again) or move it to another
   * time. Checkmarks are the attorney's; assistants may only move times.
   * When every step is checked the whole task is done.
   */
  async updateStep(
    user: RequestUser,
    id: string,
    stepId: string,
    dto: UpdateTaskStepDto,
  ): Promise<TaskDto> {
    const t = await this.own(user, id);
    const step = t.steps.find((x) => x.id === stepId);
    if (!step) throw this.stepNotFound();
    if (dto.status && user.assistant) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'Only the attorney checks steps off.',
      });
    }
    // Moving a time or writing a note is planning: the tasks duty.
    if (dto.dueAt !== undefined || dto.note !== undefined) {
      this.assertMayPlan(user);
    }
    await this.prisma.attorneyTaskStep.update({
      where: { id: stepId },
      data: {
        ...(dto.status
          ? {
              status: dto.status,
              done_at: dto.status === 'open' ? null : new Date(),
            }
          : {}),
        ...(dto.note !== undefined ? { note: dto.note || null } : {}),
        ...(dto.dueAt !== undefined
          ? { due_at: dto.dueAt ? new Date(dto.dueAt) : null }
          : {}),
      },
    });
    if (dto.status) await this.syncTaskWithSteps(t, stepId, dto.status);
    if (user.assistant) {
      await this.assistants.log(user, 'task.step.move', {
        type: 'task',
        id,
        summary: `${t.title} · ${step.title}`,
      });
    }
    return this.get(user, id);
  }

  async removeStep(
    user: RequestUser,
    id: string,
    stepId: string,
  ): Promise<TaskDto> {
    this.assertMayPlan(user);
    const t = await this.own(user, id);
    if (!t.steps.some((x) => x.id === stepId)) throw this.stepNotFound();
    await this.prisma.attorneyTaskStep.delete({ where: { id: stepId } });
    if (user.assistant) {
      await this.assistants.log(user, 'task.step.remove', {
        type: 'task',
        id,
        summary: t.title,
      });
    }
    return this.get(user, id);
  }

  /** All steps checked → the task is done (the assistant hears back). */
  private async syncTaskWithSteps(
    t: TaskRow,
    changedId: string,
    changedTo: 'open' | 'done' | 'not_done',
  ): Promise<void> {
    const statuses = t.steps.map((x) =>
      x.id === changedId ? changedTo : x.status,
    );
    const allChecked = statuses.every((x) => x === 'done' || x === 'not_done');
    if (allChecked && t.status !== 'done' && t.status !== 'not_done') {
      const status = statuses.every((x) => x === 'done') ? 'done' : 'not_done';
      await this.prisma.attorneyTask.update({
        where: { id: t.id },
        data: { status, done_at: new Date() },
      });
      await this.assistants.tellAssistant(t.created_by_membership_id, {
        taskId: t.id,
        status,
      });
    } else if (
      !allChecked &&
      (t.status === 'done' || t.status === 'not_done')
    ) {
      await this.prisma.attorneyTask.update({
        where: { id: t.id },
        data: { status: 'open', done_at: null },
      });
    }
  }

  private stepNotFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Step not found.',
    });
  }

  private closed(): ConflictException {
    return new ConflictException({
      code: ErrorCode.TASK_CLOSED,
      message: 'This task was cancelled.',
    });
  }

  private async own(user: RequestUser, id: string): Promise<TaskRow> {
    const t = await this.prisma.attorneyTask.findFirst({
      where: { id, attorney_id: user.sub },
      include: INCLUDE,
    });
    if (!t) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Task not found.',
      });
    }
    return t;
  }

  private async present(rows: TaskRow[]): Promise<TaskDto[]> {
    const fileIds = rows.flatMap((r) => r.file_ids);
    const urls = await this.files.taskFileUrls(fileIds);
    return rows.map((t: AttorneyTask & Partial<TaskRow>) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      notes: t.notes,
      dueAt: t.due_at?.toISOString() ?? null,
      location: t.location,
      caseId: t.case_id,
      caseTitle: t.case?.title ?? null,
      contactName: t.contact_name,
      contactPhone: t.contact_phone,
      contactEmail: t.contact_email,
      files: t.file_ids.map((id) => ({
        fileId: id,
        url: urls.get(id)?.url ?? null,
        mime: urls.get(id)?.mime ?? null,
      })),
      status: t.status,
      outcomeNote: t.outcome_note,
      rescheduledTo: t.rescheduled_to?.toISOString() ?? null,
      createdByName: t.created_by ? nameOf(t.created_by) : null,
      createdAt: t.created_at.toISOString(),
      doneAt: t.done_at?.toISOString() ?? null,
      steps: (t.steps ?? []).map((st) => ({
        id: st.id,
        position: st.position,
        kind: st.kind,
        title: st.title,
        dueAt: st.due_at?.toISOString() ?? null,
        location: st.location,
        contactName: st.contact_name,
        contactPhone: st.contact_phone,
        contactEmail: st.contact_email,
        status: st.status,
        note: st.note,
        doneAt: st.done_at?.toISOString() ?? null,
        createdByName: st.created_by_name,
      })),
    }));
  }
}
