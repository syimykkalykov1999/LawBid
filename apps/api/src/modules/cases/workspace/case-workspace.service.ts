import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { FilesService } from '../../files/files.service';
import { caseNotFound } from '../domain/case-state-machine';
import type {
  BoardCaseTaskDto,
  CaseActivityDto,
  CaseFileInputDto,
  CaseTaskDto,
  CaseTaskEventDto,
  CaseTaskItemDto,
  CaseTasksDto,
  CaseUpdateDto,
  CaseWorkspaceDto,
  CreateCaseTaskDto,
  CreateCaseUpdateDto,
  TaskSubmissionDto,
  WorkspaceFileDto,
} from './dto/workspace.dto';

export type Role = 'client' | 'attorney';
interface Side {
  role: Role;
  clientId: string;
  attorneyId: string;
  /** Audit 2026-10-19: false once the case is closed / archived — the
   * workspace stays readable but nothing more is added or changed. */
  writable: boolean;
}

/** The case statuses in which the workspace takes changes. */
const WORKING_STATUSES = new Set([
  'in_progress',
  'pending_completion',
  'disputed',
]);

/** Assistant duties (OQ-048) the workspace needs: [cases] to open it at all,
 * [tasks] as well to add, tick, close or answer tasks. */
type WorkspaceNeed = 'read' | 'write' | 'tasks';

/**
 * Owner 2026-10-13: the case workspace — files with notes, tasks of three
 * kinds and the Updates feed. It opens only once a bid is accepted, and
 * only for the two sides of the case (the client, the accepted attorney;
 * an assistant acts as the attorney): everyone else gets a 404, an
 * unaccepted case a 403, checked here on the server and not only in the
 * app. Audit 2026-10-19: an assistant needs the attorney's "cases" duty
 * (and "tasks" for task changes), and a closed case is read-only.
 */
@Injectable()
export class CaseWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  /** The viewer's side of an accepted case; [need] = what the call does. */
  async side(
    user: RequestUser,
    caseId: string,
    need: WorkspaceNeed = 'read',
  ): Promise<Side> {
    const a = user.assistant;
    if (a) {
      const duties = need === 'tasks' ? ['cases', 'tasks'] : ['cases'];
      const missing = duties.find((d) => !a.duties.includes(d));
      if (missing) {
        throw new ForbiddenException({
          code: ErrorCode.ASSISTANT_NOT_ALLOWED,
          message: 'The attorney has not given you this duty.',
          details: { duty: missing },
        });
      }
    }
    const c = await this.prisma.case.findFirst({
      where: { id: caseId, deleted_at: null },
      select: {
        client_id: true,
        status: true,
        accepted_bid: { select: { attorney_id: true } },
      },
    });
    if (!c) throw caseNotFound();
    const attorneyId = c.accepted_bid?.attorney_id ?? null;
    const role: Role | null =
      user.sub === c.client_id
        ? 'client'
        : attorneyId && user.sub === attorneyId
          ? 'attorney'
          : null;
    if (!role) throw caseNotFound();
    if (!attorneyId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'The case workspace opens once a bid is accepted.',
      });
    }
    const writable = WORKING_STATUSES.has(c.status);
    if (need !== 'read' && !writable) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'The case is closed: its workspace is read-only.',
      });
    }
    return { role, clientId: c.client_id, attorneyId, writable };
  }

  private roleOf(userId: string | null, s: { clientId: string }): Role {
    return userId === s.clientId ? 'client' : 'attorney';
  }

  private denied(message = 'You cannot do this.'): ForbiddenException {
    return new ForbiddenException({ code: ErrorCode.FORBIDDEN, message });
  }

  // ---- files ---------------------------------------------------------

  async listFiles(
    user: RequestUser,
    caseId: string,
  ): Promise<WorkspaceFileDto[]> {
    const s = await this.side(user, caseId);
    return this.filesOf(caseId, s);
  }

  private async filesOf(
    caseId: string,
    s: { clientId: string },
    where: Prisma.CasePhotoWhereInput = {},
  ): Promise<WorkspaceFileDto[]> {
    const rows = await this.prisma.casePhoto.findMany({
      where: { case_id: caseId, ...where },
      orderBy: { created_at: 'asc' },
    });
    if (rows.length === 0) return [];
    const urls = new Map(
      (await this.files.casePhotoUrls(rows.map((r) => r.file_id))).map((u) => [
        u.fileId,
        u,
      ]),
    );
    const taskIds = rows
      .filter((r) => r.source === 'task' && r.source_id)
      .map((r) => r.source_id as string);
    const tasks = taskIds.length
      ? await this.prisma.caseTask.findMany({
          where: { id: { in: taskIds } },
          select: { id: true, title: true },
        })
      : [];
    const titles = new Map(tasks.map((t) => [t.id, t.title]));
    const out: WorkspaceFileDto[] = [];
    for (const r of rows) {
      const u = urls.get(r.file_id);
      if (!u) continue;
      out.push({
        fileId: r.file_id,
        url: u.url,
        previewUrl: u.previewUrl,
        mime: u.mime,
        sizeBytes: u.sizeBytes,
        description: r.description,
        source: r.source as 'case' | 'task' | 'update',
        sourceTitle: r.source_id ? (titles.get(r.source_id) ?? null) : null,
        sourceId: r.source_id,
        sourceItemId: r.source_item_id,
        sample: r.is_sample,
        addedByRole: this.roleOf(r.added_by, s),
        addedAt: r.created_at.toISOString(),
      });
    }
    return out;
  }

  /** Validates [items] (the sender's clean case files, ≤20, the admin's
   * format and size limits) and links them to the case. */
  private async attach(
    tx: Prisma.TransactionClient,
    userId: string,
    caseId: string,
    items: CaseFileInputDto[],
    source: 'task' | 'update',
    sourceId: string,
    sourceItemId: string | null = null,
  ): Promise<void> {
    if (items.length === 0) return;
    const ids = items.map((i) => i.fileId);
    if (new Set(ids).size !== ids.length) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The same file is listed twice.',
      });
    }
    for (const id of ids) {
      const file = await this.files.assertAttachable(userId, id, [
        'case_photo',
        'case_attachment',
      ]);
      await this.files.assertFitsPlace('case', file);
    }
    const last = await tx.casePhoto.aggregate({
      where: { case_id: caseId },
      _max: { position: true },
    });
    let position = (last._max.position ?? -1) + 1;
    await tx.casePhoto.createMany({
      data: items.map((i) => ({
        case_id: caseId,
        file_id: i.fileId,
        position: position++,
        description: i.description?.trim() || null,
        source,
        source_id: sourceId,
        source_item_id: sourceItemId,
        is_sample: i.sample === true,
        added_by: userId,
      })),
    });
  }

  // ---- tasks ---------------------------------------------------------

  async listTasks(user: RequestUser, caseId: string): Promise<CaseTasksDto> {
    const s = await this.side(user, caseId);
    const rows = await this.prisma.caseTask.findMany({
      where: { case_id: caseId },
      orderBy: { created_at: 'desc' },
      include: {
        events: { orderBy: { created_at: 'asc' } },
        items: { orderBy: { position: 'asc' } },
      },
    });
    const allFiles = await this.filesOf(caseId, s, { source: 'task' });
    const dtos = rows.map((t) => this.taskDto(t, allFiles, s));
    const priv =
      s.role === 'attorney'
        ? (
            await this.prisma.attorneyTask.findMany({
              where: {
                case_id: caseId,
                attorney_id: s.attorneyId,
                case_task_id: null,
              },
              orderBy: { created_at: 'desc' },
            })
          ).map((p): CaseTaskDto => ({
            id: p.id,
            kind: 'private',
            createdByRole: 'attorney',
            title: p.title,
            description: p.notes,
            status: p.status === 'done' ? 'done' : 'open',
            doneAt: p.done_at?.toISOString() ?? null,
            closed: false,
            closedAt: null,
            dueAt: p.due_at?.toISOString() ?? null,
            createdAt: p.created_at.toISOString(),
            fileCount: 0,
            files: [],
            events: [],
            items: [],
            itemsDone: 0,
            itemsTotal: 0,
          }))
        : [];
    return {
      role: s.role,
      forClient: dtos.filter((t) => t.kind === 'for_client'),
      shared: dtos.filter((t) => t.kind === 'shared'),
      joint: dtos.filter((t) => t.kind === 'joint'),
      private: priv,
      canEdit:
        s.writable &&
        (!user.assistant || user.assistant.duties.includes('tasks')),
    };
  }

  private taskDto(
    t: Prisma.CaseTaskGetPayload<{ include: { events: true; items: true } }>,
    allFiles: WorkspaceFileDto[],
    s: { clientId: string },
  ): CaseTaskDto {
    const files = allFiles.filter((f) => f.sourceId === t.id);
    const items = t.items.map((i): CaseTaskItemDto => ({
      id: i.id,
      title: i.title,
      done: i.done_at !== null,
      doneAt: i.done_at?.toISOString() ?? null,
      files: files.filter((f) => f.sourceItemId === i.id),
    }));
    return {
      id: t.id,
      kind: t.kind as 'shared' | 'for_client' | 'joint',
      createdByRole: this.roleOf(t.created_by, s),
      title: t.title,
      description: t.description,
      status: t.status as 'open' | 'done',
      doneAt: t.done_at?.toISOString() ?? null,
      closed: t.closed_at !== null,
      closedAt: t.closed_at?.toISOString() ?? null,
      dueAt: t.due_at?.toISOString() ?? null,
      createdAt: t.created_at.toISOString(),
      fileCount: files.length,
      // Files of the task itself; those of a line are under that line.
      files: files.filter((f) => !f.sourceItemId),
      items,
      itemsDone: items.filter((i) => i.done).length,
      itemsTotal: items.length,
      events: t.events.map((e): CaseTaskEventDto => ({
        id: e.id,
        type: e.type,
        actorRole: this.roleOf(e.actor_id, s),
        note: e.note,
        fileCount: e.file_count,
        at: e.created_at.toISOString(),
      })),
    };
  }

  async createTask(
    user: RequestUser,
    caseId: string,
    dto: CreateCaseTaskDto,
  ): Promise<CaseTasksDto> {
    const s = await this.side(user, caseId, 'tasks');
    // Owner 2026-10-15: both sides add tasks; the client's are their own
    // to-do (`for_client`) or a task of both (`joint`).
    if (
      s.role !== 'attorney' &&
      dto.kind !== 'for_client' &&
      dto.kind !== 'joint'
    ) {
      throw this.denied('Only the attorney.');
    }
    const due = dto.dueAt ? new Date(dto.dueAt) : null;
    // Owner 2026-10-13: the bell needs a day; the reminder is the planner's
    // own (a push at remind_at), so it lands in Planner like any task.
    const before = due ? (dto.remindBeforeMin ?? null) : null;
    const planner = {
      // The reminder lands in the planner of whoever set the task.
      attorney_id: user.sub,
      kind: 'other' as const,
      title: dto.title.slice(0, 160),
      notes: dto.description ?? null,
      case_id: caseId,
      due_at: due,
      remind_before_min: before,
      remind_at:
        due && before !== null
          ? new Date(due.getTime() - before * 60_000)
          : null,
    };
    if (dto.kind === 'private') {
      await this.prisma.attorneyTask.create({ data: planner });
      return this.listTasks(user, caseId);
    }

    const lines = (dto.items ?? []).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0 && dto.kind !== 'for_client') {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Only a task for the client has a checklist.',
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      const task = await tx.caseTask.create({
        data: {
          case_id: caseId,
          kind: dto.kind,
          title: dto.title,
          description: dto.description ?? null,
          due_at: due,
          created_by: user.sub,
          events: {
            create: { case_id: caseId, actor_id: user.sub, type: 'created' },
          },
          items: {
            create: lines.map((title, position) => ({ title, position })),
          },
        },
      });
      if (before !== null) {
        await tx.attorneyTask.create({
          data: { ...planner, case_task_id: task.id },
        });
      }
      const files = dto.files ?? [];
      if (files.length > 0) {
        await this.attach(tx, user.sub, caseId, files, 'task', task.id);
        await tx.caseTaskEvent.create({
          data: {
            task_id: task.id,
            case_id: caseId,
            actor_id: user.sub,
            type: 'files_added',
            file_count: files.length,
          },
        });
      }
    });
    return this.listTasks(user, caseId);
  }

  private async taskOf(caseId: string, taskId: string) {
    const t = await this.prisma.caseTask.findFirst({
      where: { id: taskId, case_id: caseId },
      include: { items: true },
    });
    if (!t) throw caseNotFound();
    return t;
  }

  /** Done / not done. A shared task: the attorney only; a for-client task:
   * the client marks it done (once every line is ticked), the attorney can
   * take the mark off. One state for both sides. */
  async setDone(
    user: RequestUser,
    caseId: string,
    taskId: string,
    done: boolean,
  ): Promise<CaseTasksDto> {
    const s = await this.side(user, caseId, 'tasks');
    const t = await this.taskOf(caseId, taskId);
    // A shared task: the attorney only; a joint one: either side; a
    // for-client task: the client marks it done (once every line is
    // ticked); the attorney (or the client who set it) takes the mark off.
    const allowed =
      t.kind === 'joint'
        ? true
        : t.kind === 'shared'
          ? s.role === 'attorney'
          : done
            ? s.role === 'client' && t.closed_at === null
            : s.role === 'attorney' ||
              (s.role === 'client' && t.created_by === user.sub);
    if (!allowed) throw this.denied('You cannot change this task.');
    if (done && t.items.some((i) => i.done_at === null)) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Tick every line of the checklist first.',
      });
    }
    await this.prisma.caseTask.update({
      where: { id: taskId },
      data: {
        status: done ? 'done' : 'open',
        done_at: done ? new Date() : null,
        done_by: done ? user.sub : null,
        events: {
          create: {
            case_id: caseId,
            actor_id: user.sub,
            type: done ? 'done' : 'undone',
          },
        },
      },
    });
    // The planner entry of its reminder follows the task.
    await this.prisma.attorneyTask.updateMany({
      where: { case_task_id: taskId },
      data: {
        status: done ? 'done' : 'open',
        done_at: done ? new Date() : null,
      },
    });
    return this.listTasks(user, caseId);
  }

  /** Ticks / unticks one checklist line (the client, until the task is
   * closed; the attorney can untick). */
  async setItemDone(
    user: RequestUser,
    caseId: string,
    taskId: string,
    itemId: string,
    done: boolean,
  ): Promise<CaseTasksDto> {
    const s = await this.side(user, caseId, 'tasks');
    const t = await this.taskOf(caseId, taskId);
    const item = t.items.find((i) => i.id === itemId);
    if (!item) throw caseNotFound();
    const allowed =
      t.kind === 'for_client' &&
      (done ? s.role === 'client' && t.closed_at === null : true);
    if (!allowed) throw this.denied('You cannot change this line.');
    await this.prisma.caseTaskItem.update({
      where: { id: itemId },
      data: done
        ? { done_at: new Date(), done_by: user.sub }
        : { done_at: null, done_by: null },
    });
    return this.listTasks(user, caseId);
  }

  async setClosed(
    user: RequestUser,
    caseId: string,
    taskId: string,
    closed: boolean,
  ): Promise<CaseTasksDto> {
    const s = await this.side(user, caseId, 'tasks');
    if (s.role !== 'attorney') throw this.denied('Only the attorney.');
    const t = await this.taskOf(caseId, taskId);
    if (t.kind !== 'for_client') {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Only a task for the client can be closed.',
      });
    }
    await this.prisma.caseTask.update({
      where: { id: taskId },
      data: {
        closed_at: closed ? new Date() : null,
        events: {
          create: {
            case_id: caseId,
            actor_id: user.sub,
            type: closed ? 'closed' : 'reopened',
          },
        },
      },
    });
    return this.listTasks(user, caseId);
  }

  /** A note and files on a task. The client answers a task for the client
   * (to a checklist line, too) — also after "Done", until the attorney
   * closes it; the attorney adds materials to any task. */
  async submit(
    user: RequestUser,
    caseId: string,
    taskId: string,
    dto: TaskSubmissionDto,
  ): Promise<CaseTasksDto> {
    const s = await this.side(user, caseId, 'tasks');
    const t = await this.taskOf(caseId, taskId);
    if (s.role === 'client') {
      if (t.kind !== 'for_client') {
        throw this.denied('Only the attorney can add to this task.');
      }
      if (t.closed_at) {
        throw new ConflictException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'The attorney closed this task.',
        });
      }
    }
    const item = dto.itemId ? t.items.find((i) => i.id === dto.itemId) : null;
    if (dto.itemId && !item) throw caseNotFound();
    const note = dto.note?.trim() || null;
    if (!note && dto.files.length === 0) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Add a note or a file.',
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await this.attach(
        tx,
        user.sub,
        caseId,
        dto.files,
        'task',
        taskId,
        item?.id ?? null,
      );
      await tx.caseTaskEvent.create({
        data: {
          task_id: taskId,
          case_id: caseId,
          actor_id: user.sub,
          type: 'files_added',
          note,
          file_count: dto.files.length,
        },
      });
      // Answering a line ticks it for the client.
      if (item && s.role === 'client' && item.done_at === null) {
        await tx.caseTaskItem.update({
          where: { id: item.id },
          data: { done_at: new Date(), done_by: user.sub },
        });
      }
    });
    return this.listTasks(user, caseId);
  }

  // ---- updates -------------------------------------------------------

  private async people(s: Side): Promise<
    Map<
      string,
      {
        name: string;
        avatarUrl: string | null;
        states: string[];
      }
    >
  > {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [s.clientId, s.attorneyId] } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        avatar_file_id: true,
      },
    });
    const licenses = await this.prisma.attorneyLicense.findMany({
      where: { attorney_id: s.attorneyId, license_status: 'verified' },
      select: { state_code: true },
      orderBy: { state_code: 'asc' },
    });
    const out = new Map<
      string,
      { name: string; avatarUrl: string | null; states: string[] }
    >();
    for (const u of users) {
      out.set(u.id, {
        name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
        avatarUrl: await this.files.mediaUrl(u.avatar_file_id),
        states: u.id === s.attorneyId ? licenses.map((l) => l.state_code) : [],
      });
    }
    return out;
  }

  async listUpdates(
    user: RequestUser,
    caseId: string,
  ): Promise<CaseUpdateDto[]> {
    const s = await this.side(user, caseId);
    const [updates, events, files, people] = await Promise.all([
      this.prisma.caseUpdate.findMany({ where: { case_id: caseId } }),
      this.prisma.caseTaskEvent.findMany({
        where: { case_id: caseId, type: { in: ['done', 'files_added'] } },
        include: { task: { select: { title: true, id: true } } },
      }),
      this.filesOf(caseId, s, { source: { in: ['update', 'task'] } }),
      this.people(s),
    ]);
    const who = (id: string) => people.get(id);
    const out: CaseUpdateDto[] = [];
    for (const u of updates) {
      const p = who(u.author_id);
      out.push({
        id: u.id,
        authorRole: this.roleOf(u.author_id, s),
        authorName: p?.name ?? '',
        authorAvatarUrl: p?.avatarUrl ?? null,
        authorStates: p?.states ?? [],
        body: u.body,
        files: files.filter(
          (f) => f.source === 'update' && f.sourceId === u.id,
        ),
        at: u.created_at.toISOString(),
        kind: 'update',
        taskTitle: null,
      });
    }
    for (const e of events) {
      const p = who(e.actor_id);
      out.push({
        id: e.id,
        authorRole: this.roleOf(e.actor_id, s),
        authorName: p?.name ?? '',
        authorAvatarUrl: p?.avatarUrl ?? null,
        authorStates: p?.states ?? [],
        body: e.note ?? '',
        files:
          e.type === 'files_added'
            ? files.filter(
                (f) =>
                  f.source === 'task' &&
                  f.sourceId === e.task_id &&
                  Math.abs(Date.parse(f.addedAt) - e.created_at.getTime()) <
                    5000,
              )
            : [],
        at: e.created_at.toISOString(),
        kind: e.type === 'done' ? 'task_done' : 'task_files',
        taskTitle: e.task.title,
      });
    }
    return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }

  async createUpdate(
    user: RequestUser,
    caseId: string,
    dto: CreateCaseUpdateDto,
  ): Promise<CaseUpdateDto[]> {
    await this.side(user, caseId, 'write');
    await withTxRetry(this.prisma, async (tx) => {
      const u = await tx.caseUpdate.create({
        data: { case_id: caseId, author_id: user.sub, body: dto.body },
      });
      await this.attach(tx, user.sub, caseId, dto.files, 'update', u.id);
      // Writing is reading: your own update never counts as new for you.
      await tx.caseRead.upsert({
        where: { case_id_user_id: { case_id: caseId, user_id: user.sub } },
        create: { case_id: caseId, user_id: user.sub },
        update: { updates_seen_at: new Date() },
      });
    });
    return this.listUpdates(user, caseId);
  }

  /** The viewer opened the Updates tab: the grey count goes away. */
  async markUpdatesSeen(user: RequestUser, caseId: string): Promise<void> {
    await this.side(user, caseId);
    await this.prisma.caseRead.upsert({
      where: { case_id_user_id: { case_id: caseId, user_id: user.sub } },
      create: { case_id: caseId, user_id: user.sub },
      update: { updates_seen_at: new Date() },
    });
  }

  // ---- activity ------------------------------------------------------

  /** Everything that happened in the case, newest first. */
  async activity(
    user: RequestUser,
    caseId: string,
  ): Promise<CaseActivityDto[]> {
    const s = await this.side(user, caseId);
    const [updates, events, people] = await Promise.all([
      this.prisma.caseUpdate.findMany({ where: { case_id: caseId } }),
      this.prisma.caseTaskEvent.findMany({
        where: { case_id: caseId },
        include: { task: { select: { title: true } } },
      }),
      this.people(s),
    ]);
    const name = (id: string) => people.get(id)?.name ?? '';
    const kinds: Record<string, string> = {
      created: 'task_created',
      done: 'task_done',
      undone: 'task_undone',
      closed: 'task_closed',
      reopened: 'task_reopened',
      files_added: 'files_added',
    };
    const out: CaseActivityDto[] = [
      ...updates.map((u): CaseActivityDto => ({
        id: u.id,
        kind: 'update',
        actorRole: this.roleOf(u.author_id, s),
        actorName: name(u.author_id),
        text: u.body,
        taskTitle: null,
        fileCount: 0,
        at: u.created_at.toISOString(),
      })),
      ...events.map((e): CaseActivityDto => ({
        id: e.id,
        kind: kinds[e.type] ?? e.type,
        actorRole: this.roleOf(e.actor_id, s),
        actorName: name(e.actor_id),
        text: e.note,
        taskTitle: e.task.title,
        fileCount: e.file_count,
        at: e.created_at.toISOString(),
      })),
    ];
    return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }

  // ---- board (Mine › Tasks) ------------------------------------------

  /** Owner 2026-10-15: the case tasks of every case in work, for the
   * planner board: the viewer's own side, newest first; done ones for 45
   * days (the archive). */
  async board(user: RequestUser): Promise<BoardCaseTaskDto[]> {
    // Audit 2026-10-19: an assistant sees case tasks only with "cases".
    if (user.assistant && !user.assistant.duties.includes('cases')) return [];
    const since = new Date(Date.now() - 45 * 24 * 3600e3);
    const rows = await this.prisma.caseTask.findMany({
      where: {
        case: {
          deleted_at: null,
          status: { in: ['in_progress', 'pending_completion', 'disputed'] },
          OR: [
            { client_id: user.sub },
            { accepted_bid: { attorney_id: user.sub } },
          ],
        },
        OR: [{ status: 'open' }, { done_at: { gte: since } }],
      },
      orderBy: { created_at: 'desc' },
      take: 400,
      include: {
        items: { orderBy: { position: 'asc' } },
        case: {
          select: {
            id: true,
            title: true,
            client_id: true,
            practice_area: { select: { code: true } },
          },
        },
      },
    });
    return rows.map((t): BoardCaseTaskDto => {
      const role: Role = t.case.client_id === user.sub ? 'client' : 'attorney';
      const items = t.items.map((i): CaseTaskItemDto => ({
        id: i.id,
        title: i.title,
        done: i.done_at !== null,
        doneAt: i.done_at?.toISOString() ?? null,
        files: [],
      }));
      const done = t.status === 'done';
      const canTick =
        t.kind === 'joint'
          ? true
          : t.kind === 'shared'
            ? role === 'attorney'
            : done
              ? role === 'attorney' ||
                (role === 'client' && t.created_by === user.sub)
              : role === 'client' && t.closed_at === null;
      return {
        id: t.id,
        kind: t.kind as 'shared' | 'for_client' | 'joint',
        createdByRole: this.roleOf(t.created_by, {
          clientId: t.case.client_id,
        }),
        title: t.title,
        description: t.description,
        status: done ? 'done' : 'open',
        doneAt: t.done_at?.toISOString() ?? null,
        closed: t.closed_at !== null,
        closedAt: t.closed_at?.toISOString() ?? null,
        dueAt: t.due_at?.toISOString() ?? null,
        createdAt: t.created_at.toISOString(),
        fileCount: 0,
        files: [],
        events: [],
        items,
        itemsDone: items.filter((i) => i.done).length,
        itemsTotal: items.length,
        caseId: t.case.id,
        caseTitle: t.case.title,
        practiceCode: t.case.practice_area.code,
        viewerRole: role,
        canTick,
      };
    });
  }

  // ---- summary -------------------------------------------------------

  async summary(user: RequestUser, caseId: string): Promise<CaseWorkspaceDto> {
    const s = await this.side(user, caseId);
    const read = await this.prisma.caseRead.findUnique({
      where: { case_id_user_id: { case_id: caseId, user_id: user.sub } },
      select: { updates_seen_at: true },
    });
    const other = s.role === 'client' ? s.attorneyId : s.clientId;
    const [files, sharedTasks, privateTasks, updatesCount, newUpdates] =
      await Promise.all([
        this.filesOf(caseId, s),
        this.prisma.caseTask.count({
          where: { case_id: caseId, status: 'open' },
        }),
        // The attorney's own tasks count for the attorney only.
        s.role === 'attorney'
          ? this.prisma.attorneyTask.count({
              where: {
                case_id: caseId,
                attorney_id: s.attorneyId,
                case_task_id: null,
                status: { in: ['open', 'taken'] },
              },
            })
          : Promise.resolve(0),
        this.prisma.caseUpdate.count({ where: { case_id: caseId } }),
        this.prisma.caseUpdate.count({
          where: {
            case_id: caseId,
            author_id: other,
            ...(read ? { created_at: { gt: read.updates_seen_at } } : {}),
          },
        }),
      ]);
    const k = await this.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: {
        created_at: true,
        bids_count: true,
        accepted_bid: { select: { decided_at: true } },
      },
    });
    return {
      role: s.role,
      files,
      openTasks: sharedTasks + privateTasks,
      updatesCount,
      newUpdates,
      publishedAt: k.created_at.toISOString(),
      acceptedAt: k.accepted_bid?.decided_at?.toISOString() ?? null,
      bidsCount: k.bids_count,
      canWrite: s.writable,
    };
  }
}
