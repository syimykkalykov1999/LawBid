import {
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
  UpdateTaskStatusDto,
} from './assistants.dto';

const INCLUDE = {
  case: { select: { title: true } },
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

  async create(user: RequestUser, dto: CreateTaskDto): Promise<TaskDto> {
    const a = user.assistant;
    if (a && !a.duties.includes('tasks')) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'The attorney has not given you this duty.',
        details: { duty: 'tasks' },
      });
    }
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
    }));
  }
}
