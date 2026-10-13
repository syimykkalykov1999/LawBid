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
  CaseFileInputDto,
  CaseTaskDto,
  CaseTaskEventDto,
  CaseTasksDto,
  CaseUpdateDto,
  CaseWorkspaceDto,
  CreateCaseTaskDto,
  CreateCaseUpdateDto,
  TaskSubmissionDto,
  WorkspaceFileDto,
} from './dto/workspace.dto';

export type Role = 'client' | 'attorney';

/**
 * Owner 2026-10-13: the case workspace — files with notes, tasks of three
 * kinds and the Updates feed. It opens only once a bid is accepted, and
 * only for the two sides of the case (the client, the accepted attorney):
 * everyone else gets a 404, an unaccepted case a 403, checked here on the
 * server and not only in the app.
 */
@Injectable()
export class CaseWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  /** The viewer's side of an accepted case. */
  async side(
    user: RequestUser,
    caseId: string,
  ): Promise<{ role: Role; clientId: string; attorneyId: string }> {
    const c = await this.prisma.case.findFirst({
      where: { id: caseId, deleted_at: null },
      select: {
        client_id: true,
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
    return { role, clientId: c.client_id, attorneyId };
  }

  private roleOf(userId: string | null, s: { clientId: string }): Role {
    return userId === s.clientId ? 'client' : 'attorney';
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
      include: { events: { orderBy: { created_at: 'asc' } } },
    });
    const allFiles = await this.filesOf(caseId, s, { source: 'task' });
    const dtos = rows.map((t) => this.taskDto(t, allFiles, s));
    const priv =
      s.role === 'attorney'
        ? (
            await this.prisma.attorneyTask.findMany({
              where: { case_id: caseId, attorney_id: s.attorneyId },
              orderBy: { created_at: 'desc' },
            })
          ).map((p): CaseTaskDto => ({
            id: p.id,
            kind: 'private',
            title: p.title,
            description: p.notes,
            status: p.status === 'done' ? 'done' : 'open',
            doneAt: p.done_at?.toISOString() ?? null,
            closed: false,
            createdAt: p.created_at.toISOString(),
            fileCount: 0,
            files: [],
            events: [],
          }))
        : [];
    return {
      role: s.role,
      forClient: dtos.filter((t) => t.kind === 'for_client'),
      shared: dtos.filter((t) => t.kind === 'shared'),
      private: priv,
    };
  }

  private taskDto(
    t: Prisma.CaseTaskGetPayload<{ include: { events: true } }>,
    allFiles: WorkspaceFileDto[],
    s: { clientId: string },
  ): CaseTaskDto {
    const files = allFiles.filter((f) => f.sourceId === t.id);
    return {
      id: t.id,
      kind: t.kind as 'shared' | 'for_client',
      title: t.title,
      description: t.description,
      status: t.status as 'open' | 'done',
      doneAt: t.done_at?.toISOString() ?? null,
      closed: t.closed_at !== null,
      createdAt: t.created_at.toISOString(),
      fileCount: files.length,
      files,
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
    const s = await this.side(user, caseId);
    this.attorneyOnly(s.role);
    if (dto.kind === 'private') {
      await this.prisma.attorneyTask.create({
        data: {
          attorney_id: s.attorneyId,
          kind: 'other',
          title: dto.title.slice(0, 160),
          notes: dto.description ?? null,
          case_id: caseId,
        },
      });
    } else {
      await this.prisma.caseTask.create({
        data: {
          case_id: caseId,
          kind: dto.kind,
          title: dto.title,
          description: dto.description ?? null,
          created_by: user.sub,
          events: {
            create: { case_id: caseId, actor_id: user.sub, type: 'created' },
          },
        },
      });
    }
    return this.listTasks(user, caseId);
  }

  private attorneyOnly(role: Role): void {
    if (role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the attorney can do this.',
      });
    }
  }

  private async taskOf(caseId: string, taskId: string) {
    const t = await this.prisma.caseTask.findFirst({
      where: { id: taskId, case_id: caseId },
    });
    if (!t) throw caseNotFound();
    return t;
  }

  /** Done / not done. A shared task: the attorney only; a for-client task:
   * the client marks it done, the attorney can take the mark off. One
   * state for both sides. */
  async setDone(
    user: RequestUser,
    caseId: string,
    taskId: string,
    done: boolean,
  ): Promise<CaseTasksDto> {
    const s = await this.side(user, caseId);
    const t = await this.taskOf(caseId, taskId);
    const allowed =
      t.kind === 'shared'
        ? s.role === 'attorney'
        : done
          ? s.role === 'client' && t.closed_at === null
          : s.role === 'attorney';
    if (!allowed) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You cannot change this task.',
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
    return this.listTasks(user, caseId);
  }

  async setClosed(
    user: RequestUser,
    caseId: string,
    taskId: string,
    closed: boolean,
  ): Promise<CaseTasksDto> {
    const s = await this.side(user, caseId);
    this.attorneyOnly(s.role);
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

  /** The client's answer to a for-client task: a note and files. It stays
   * open for more after "Done" until the attorney closes the task. */
  async submit(
    user: RequestUser,
    caseId: string,
    taskId: string,
    dto: TaskSubmissionDto,
  ): Promise<CaseTasksDto> {
    const s = await this.side(user, caseId);
    const t = await this.taskOf(caseId, taskId);
    if (s.role !== 'client' || t.kind !== 'for_client') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the client can answer a task for the client.',
      });
    }
    if (t.closed_at) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The attorney closed this task.',
      });
    }
    const note = dto.note?.trim() || null;
    if (!note && dto.files.length === 0) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Add a note or a file.',
      });
    }
    await withTxRetry(this.prisma, async (tx) => {
      await this.attach(tx, user.sub, caseId, dto.files, 'task', taskId);
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
    });
    return this.listTasks(user, caseId);
  }

  // ---- updates -------------------------------------------------------

  async listUpdates(
    user: RequestUser,
    caseId: string,
  ): Promise<CaseUpdateDto[]> {
    const s = await this.side(user, caseId);
    const [updates, events, files] = await Promise.all([
      this.prisma.caseUpdate.findMany({ where: { case_id: caseId } }),
      this.prisma.caseTaskEvent.findMany({
        where: { case_id: caseId, type: { in: ['done', 'files_added'] } },
        include: { task: { select: { title: true, id: true } } },
      }),
      this.filesOf(caseId, s, { source: { in: ['update', 'task'] } }),
    ]);
    const names = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [s.clientId, s.attorneyId] } },
          select: { id: true, first_name: true, last_name: true },
        })
      ).map((u) => [u.id, `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()]),
    );
    const out: CaseUpdateDto[] = [];
    for (const u of updates) {
      out.push({
        id: u.id,
        authorRole: this.roleOf(u.author_id, s),
        authorName: names.get(u.author_id) ?? '',
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
      out.push({
        id: e.id,
        authorRole: this.roleOf(e.actor_id, s),
        authorName: names.get(e.actor_id) ?? '',
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
    await this.side(user, caseId);
    await withTxRetry(this.prisma, async (tx) => {
      const u = await tx.caseUpdate.create({
        data: { case_id: caseId, author_id: user.sub, body: dto.body },
      });
      await this.attach(tx, user.sub, caseId, dto.files, 'update', u.id);
    });
    return this.listUpdates(user, caseId);
  }

  // ---- summary -------------------------------------------------------

  async summary(user: RequestUser, caseId: string): Promise<CaseWorkspaceDto> {
    const s = await this.side(user, caseId);
    const [files, openTasks, updatesCount] = await Promise.all([
      this.filesOf(caseId, s),
      this.prisma.caseTask.count({
        where: { case_id: caseId, status: 'open' },
      }),
      this.prisma.caseUpdate.count({ where: { case_id: caseId } }),
    ]);
    return { role: s.role, files, openTasks, updatesCount };
  }
}
