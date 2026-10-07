import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AttorneyTaskRepeat,
  AttorneyTaskStatus,
  Prisma,
} from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { FilesService } from '../files/files.service';
import { assertUploadCount, readUploadLimits } from '../files/upload-limits';
import { NotificationsService } from '../notifications/notifications.service';
import { AssistantsService, nameOf } from './assistants.service';
import type {
  BulkTasksDto,
  BulkTasksResultDto,
  CreateTaskDto,
  TaskDto,
  TaskPersonInputDto,
  TaskPersonSuggestionDto,
  TaskPlaceInputDto,
  TaskPlaceSuggestionDto,
  TasksQueryDto,
  TaskStepInputDto,
  UpdateTaskStatusDto,
  UpdateTaskDto,
  UpdateTaskStepDto,
} from './assistants.dto';

/** Steps per task (CreateTaskDto caps the initial list the same way). */
const MAX_STEPS = 100;
const DAY_MS = 24 * 3600 * 1000;
const FINISHED: AttorneyTaskStatus[] = ['done', 'not_done', 'cancelled'];
const ACTIVE: AttorneyTaskStatus[] = ['open', 'taken'];

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

const PERSON_USER = {
  select: {
    id: true,
    role: true,
    first_name: true,
    last_name: true,
    avatar_file_id: true,
  },
} satisfies Prisma.UserDefaultArgs;

type PersonUser = Prisma.UserGetPayload<typeof PERSON_USER>;

const MEMBER_NAMES = {
  select: {
    display_name: true,
    phone_e164: true,
    assistant_user: { select: { first_name: true, last_name: true } },
  },
} satisfies Prisma.AssistantMembershipDefaultArgs;

const INCLUDE = {
  case: { select: { title: true } },
  steps: { orderBy: [{ position: 'asc' }, { created_at: 'asc' }] },
  places: { orderBy: [{ position: 'asc' }, { created_at: 'asc' }] },
  people: {
    orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
    include: { user: PERSON_USER },
  },
  created_by: MEMBER_NAMES,
  assignee: MEMBER_NAMES,
} satisfies Prisma.AttorneyTaskInclude;

type TaskRow = Prisma.AttorneyTaskGetPayload<{ include: typeof INCLUDE }>;

/** Owner 2026-10-05: the next time of a repeating task. */
export function nextOccurrence(from: Date, repeat: AttorneyTaskRepeat): Date {
  const d = new Date(from.getTime());
  switch (repeat) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case 'weekdays':
      do {
        d.setUTCDate(d.getUTCDate() + 1);
      } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
      break;
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case 'monthly': {
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
      const last = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate();
      d.setUTCDate(Math.min(day, last));
      break;
    }
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    default:
      break;
  }
  return d;
}

function remindAt(due: Date | null, before: number | null): Date | null {
  if (!due || before === null) return null;
  return new Date(due.getTime() - before * 60_000);
}

function fullName(u: {
  first_name: string | null;
  last_name: string | null;
}): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ');
}

/**
 * Owner 2026-09-30 (OQ-048) → 2026-10-05: the attorney's planner. A task
 * (call, meeting, court, deadline…) has a time with a reminder, a
 * priority, a repeat, any number of addresses (opened in the maps app)
 * and people (from the app — the chat opens — or outside contacts: call,
 * write), a case and a chat, a checklist of steps, notes and files. It can
 * be assigned to an assistant, who then sees and checks it off. Finished
 * tasks go to the archive, which is cleaned after a year unless kept.
 *
 * Rights: the attorney does everything. An assistant with the `tasks`
 * duty plans (creates, edits, adds people and places, assigns) and sees
 * every task; without it, only the tasks assigned to them. An assistant
 * checks off what is assigned to them.
 * A client's own planner works the same, without a team.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly assistants: AssistantsService,
    private readonly settings: AppSettingsService,
  ) {}

  // --- rights ---------------------------------------------------------

  private plans(user: RequestUser): boolean {
    return !user.assistant || user.assistant.duties.includes('tasks');
  }

  private assertMayPlan(user: RequestUser): void {
    if (!this.plans(user)) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'The attorney has not given you this duty.',
        details: { duty: 'tasks' },
      });
    }
  }

  /** The attorney checks off everything; an assistant only the tasks
   * assigned to them (a task an assistant set is for the attorney). */
  private mayComplete(
    user: RequestUser,
    t: { assignee_membership_id: string | null },
  ): boolean {
    const a = user.assistant;
    return !a || t.assignee_membership_id === a.membershipId;
  }

  private assertMayComplete(
    user: RequestUser,
    t: { assignee_membership_id: string | null },
  ): void {
    if (!this.mayComplete(user, t)) {
      throw new ForbiddenException({
        code: ErrorCode.ASSISTANT_NOT_ALLOWED,
        message: 'Only the attorney or the assigned assistant checks it off.',
      });
    }
  }

  private mayDelete(
    user: RequestUser,
    t: { created_by_membership_id: string | null },
  ): boolean {
    const a = user.assistant;
    return (
      !a || (this.plans(user) && t.created_by_membership_id === a.membershipId)
    );
  }

  /** What this viewer sees of the planner. */
  private visible(user: RequestUser): Prisma.AttorneyTaskWhereInput {
    const a = user.assistant;
    return {
      attorney_id: user.sub,
      ...(a && !this.plans(user)
        ? { assignee_membership_id: a.membershipId }
        : {}),
    };
  }

  // --- links ----------------------------------------------------------

  /** Audit 2026-10-01: a task links only a case of this account — the
   * client's own or one where its bid was accepted (the case title is
   * shown on the task, so a foreign id would leak it). */
  private async assertCaseLink(userId: string, caseId: string): Promise<void> {
    const c = await this.prisma.case.findFirst({
      where: {
        id: caseId,
        OR: [{ client_id: userId }, { accepted_bid: { attorney_id: userId } }],
      },
      select: { id: true },
    });
    if (!c) throw this.notFound('Case not found.');
  }

  /** The chat link: a chat of this account only. */
  private async assertChatLink(userId: string, id: string): Promise<void> {
    const c = await this.prisma.conversation.findFirst({
      where: { id, OR: [{ attorney_id: userId }, { client_id: userId }] },
      select: { id: true },
    });
    if (!c) throw this.notFound('Chat not found.');
  }

  /** An assistant of this team (active) to assign the task to. */
  private async assertAssignee(
    ownerId: string,
    membershipId: string,
  ): Promise<void> {
    const m = await this.prisma.assistantMembership.findFirst({
      where: { id: membershipId, attorney_id: ownerId, status: 'active' },
      select: { id: true },
    });
    if (!m) throw this.notFound('Assistant not found.');
  }

  /**
   * People from the app a planner may add: attorneys (public profiles),
   * the team's assistants and anyone this account has a chat with (a case
   * client, a colleague). Anything else would expose a stranger's name.
   */
  private async appPeople(
    ownerId: string,
    userIds: string[],
  ): Promise<Map<string, PersonUser>> {
    const ids = [...new Set(userIds)];
    const out = new Map<string, PersonUser>();
    if (ids.length === 0) return out;
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, deleted_at: null },
      ...PERSON_USER,
    });
    const team = await this.prisma.assistantMembership.findMany({
      where: {
        attorney_id: ownerId,
        status: 'active',
        assistant_user_id: { in: ids },
      },
      select: { assistant_user_id: true },
    });
    const chats = await this.prisma.conversation.findMany({
      where: {
        OR: [
          { attorney_id: ownerId, client_id: { in: ids } },
          { client_id: ownerId, attorney_id: { in: ids } },
        ],
      },
      select: { attorney_id: true, client_id: true },
    });
    const known = new Set<string>([
      ownerId,
      ...team.map((m) => m.assistant_user_id ?? ''),
      ...chats.flatMap((c) => [c.attorney_id, c.client_id]),
    ]);
    for (const u of users) {
      if (u.role === 'attorney' || known.has(u.id)) out.set(u.id, u);
    }
    for (const id of ids) {
      if (!out.has(id)) throw this.notFound('Person not found.');
    }
    return out;
  }

  private async peopleData(
    ownerId: string,
    people: TaskPersonInputDto[],
  ): Promise<
    {
      position: number;
      user_id: string | null;
      name: string;
      role: string | null;
      phone: string | null;
      email: string | null;
    }[]
  > {
    const users = await this.appPeople(
      ownerId,
      people.map((p) => p.userId).filter((x): x is string => !!x),
    );
    return people.map((p, i) => {
      const u = p.userId ? users.get(p.userId) : undefined;
      const name = p.name || (u ? fullName(u) : '');
      if (!name) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A contact needs a name.',
        });
      }
      return {
        position: i,
        user_id: u?.id ?? null,
        name: name.slice(0, 120),
        role: p.role || null,
        phone: p.phone || null,
        email: p.email || null,
      };
    });
  }

  private placesData(places: TaskPlaceInputDto[]) {
    return places.map((p, i) => ({
      position: i,
      label: p.label || null,
      address: p.address,
    }));
  }

  /** Old apps send one `location` / one contact: the first place/person. */
  private legacyPlaces(dto: CreateTaskDto): TaskPlaceInputDto[] {
    if (dto.places) return dto.places;
    return dto.location ? [{ address: dto.location }] : [];
  }

  private legacyPeople(dto: CreateTaskDto): TaskPersonInputDto[] {
    if (dto.people) return dto.people;
    const name = dto.contactName || dto.contactPhone || dto.contactEmail;
    return name
      ? [{ name, phone: dto.contactPhone, email: dto.contactEmail }]
      : [];
  }

  /** Owner 2026-10-07 (bugs 14, 17): files on one task — the admin's
   * «Задачи» limit in «Загрузки и файлы» (storage costs). An older task
   * over the limit ([had] files) may keep or drop files, not add. */
  private async assertFileCount(count: number, had = 0): Promise<void> {
    assertUploadCount(
      await readUploadLimits(this.settings),
      'task',
      'files',
      count,
      had,
    );
  }

  // --- create / read --------------------------------------------------

  async create(user: RequestUser, dto: CreateTaskDto): Promise<TaskDto> {
    const a = user.assistant;
    this.assertMayPlan(user);
    if (dto.caseId) await this.assertCaseLink(user.sub, dto.caseId);
    if (dto.conversationId) {
      await this.assertChatLink(user.sub, dto.conversationId);
    }
    if (dto.assigneeMembershipId) {
      await this.assertAssignee(user.sub, dto.assigneeMembershipId);
    }
    const fileIds = [...new Set(dto.fileIds ?? [])];
    await this.assertFileCount(fileIds.length);
    for (const id of fileIds) {
      // The uploader is whoever is signed in (the assistant's files are
      // owned by the attorney account they act in).
      await this.files.assertAttachable(user.sub, id, ['task_attachment']);
    }
    const people = await this.peopleData(user.sub, this.legacyPeople(dto));
    const due = dto.dueAt ? new Date(dto.dueAt) : null;
    // A task with a time reminds at that time unless told otherwise.
    const before = dto.remindBeforeMin ?? (due ? 0 : null);
    const t = await this.prisma.attorneyTask.create({
      data: {
        attorney_id: user.sub,
        created_by_membership_id: a?.membershipId ?? null,
        assignee_membership_id: dto.assigneeMembershipId ?? null,
        kind: dto.kind,
        title: dto.title,
        notes: dto.notes ?? null,
        due_at: due,
        case_id: dto.caseId ?? null,
        conversation_id: dto.conversationId ?? null,
        file_ids: fileIds,
        priority: dto.priority ?? 'normal',
        repeat: dto.repeat ?? 'none',
        repeat_until: dto.repeatUntil ? new Date(dto.repeatUntil) : null,
        remind_before_min: before,
        remind_at: remindAt(due, before),
        keep_forever: dto.keepForever ?? false,
        steps: {
          create: (dto.steps ?? []).map((st, i) => ({
            ...stepData(st),
            position: i,
            created_by_name: a?.name ?? null,
          })),
        },
        places: { create: this.placesData(this.legacyPlaces(dto)) },
        people: { create: people },
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
    await this.tellAssignee(user, t.id, null, t.assignee_membership_id);
    return (await this.present([t], user))[0];
  }

  async list(user: RequestUser, q: TasksQueryDto): Promise<TaskDto[]> {
    const view = q.view ?? 'active';
    const a = user.assistant;
    const archive = view === 'done' || view === 'archive';
    const and: Prisma.AttorneyTaskWhereInput[] = [this.visible(user)];
    if (q.mine && a) and.push({ created_by_membership_id: a.membershipId });
    if (view === 'active') {
      and.push({ status: { in: ACTIVE }, archived_at: null });
    } else if (archive) {
      and.push({
        OR: [{ archived_at: { not: null } }, { status: { in: FINISHED } }],
      });
    }
    if (q.caseId) and.push({ case_id: q.caseId });
    if (q.assignee === 'none') {
      and.push({ assignee_membership_id: null });
    } else if (q.assignee === 'me') {
      // The attorney has no membership: "mine" = nobody else's.
      and.push({ assignee_membership_id: a?.membershipId ?? null });
    } else if (q.assignee) {
      and.push({ assignee_membership_id: q.assignee });
    }
    if (q.from || q.to) {
      and.push({
        due_at: {
          ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
          ...(q.to ? { lte: new Date(`${q.to}T23:59:59Z`) } : {}),
        },
      });
    }
    if (q.dueFrom || q.dueTo) {
      and.push({
        due_at: {
          ...(q.dueFrom ? { gte: new Date(q.dueFrom) } : {}),
          ...(q.dueTo ? { lt: new Date(q.dueTo) } : {}),
        },
      });
    }
    if (q.overdue) {
      and.push({ due_at: { lt: new Date() }, status: { in: ACTIVE } });
    }
    if (q.q) {
      const text = { contains: q.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { title: text },
          { notes: text },
          { places: { some: { address: text } } },
          { people: { some: { name: text } } },
          { case: { title: text } },
        ],
      });
    }
    const sort = q.sort ?? (archive ? 'updated' : 'due');
    const byDue: Prisma.AttorneyTaskOrderByWithRelationInput[] = [
      { due_at: { sort: 'asc', nulls: 'last' } },
      { created_at: 'asc' },
    ];
    const orderBy: Prisma.AttorneyTaskOrderByWithRelationInput[] =
      sort === 'priority'
        ? [{ priority: 'desc' }, ...byDue]
        : sort === 'created'
          ? [{ created_at: 'desc' }]
          : sort === 'updated'
            ? archive
              ? [
                  { archived_at: { sort: 'desc', nulls: 'last' } },
                  { updated_at: 'desc' },
                ]
              : [{ updated_at: 'desc' }]
            : byDue;
    const rows = await this.prisma.attorneyTask.findMany({
      where: { AND: and },
      orderBy,
      take: archive ? 500 : 300,
      include: INCLUDE,
    });
    return this.present(rows, user);
  }

  async get(user: RequestUser, id: string): Promise<TaskDto> {
    return (await this.present([await this.own(user, id)], user))[0];
  }

  /** Owner 2026-10-05: addresses already used here — the address field
   * suggests them (no maps API). */
  async places(user: RequestUser): Promise<TaskPlaceSuggestionDto[]> {
    const rows = await this.prisma.attorneyTaskPlace.groupBy({
      by: ['address'],
      where: { task: { attorney_id: user.sub } },
      _count: { _all: true },
      _max: { label: true, created_at: true },
      orderBy: [{ _max: { created_at: 'desc' } }],
      take: 50,
    });
    return rows.map((r) => ({
      address: r.address,
      label: r._max.label ?? null,
      uses: r._count._all,
    }));
  }

  /**
   * Owner 2026-10-05: whom the planner can add — the team's assistants,
   * the people this account chats with (clients, colleagues), outside
   * contacts used before and, when searching, attorneys by name.
   */
  async peopleSuggestions(
    user: RequestUser,
    query?: string,
  ): Promise<TaskPersonSuggestionDto[]> {
    const q = query?.trim().toLowerCase() ?? '';
    const match = (s: string | null | undefined) =>
      !q || (s ?? '').toLowerCase().includes(q);
    const out: TaskPersonSuggestionDto[] = [];
    const avatars: (string | null)[] = [];
    const seen = new Set<string>([user.sub]);
    const push = (
      p: Omit<TaskPersonSuggestionDto, 'avatarUrl'>,
      avatar: string | null,
    ) => {
      avatars.push(avatar);
      out.push({ ...p, avatarUrl: null });
    };

    const team = await this.prisma.assistantMembership.findMany({
      where: { attorney_id: user.sub, status: 'active' },
      include: {
        assistant_user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });
    for (const m of team) {
      const n = nameOf(m);
      if (!match(n)) continue;
      if (m.assistant_user) seen.add(m.assistant_user.id);
      push(
        {
          userId: m.assistant_user?.id ?? null,
          membershipId: m.id,
          source: 'assistant',
          name: n,
          role: null,
          phone: null,
          email: null,
        },
        m.assistant_user?.avatar_file_id ?? null,
      );
    }

    const chats = await this.prisma.conversation.findMany({
      where: { OR: [{ attorney_id: user.sub }, { client_id: user.sub }] },
      orderBy: { last_message_at: { sort: 'desc', nulls: 'last' } },
      take: 200,
      select: { attorney: PERSON_USER, client: PERSON_USER },
    });
    for (const c of chats) {
      const other = c.attorney.id === user.sub ? c.client : c.attorney;
      if (seen.has(other.id) || !match(fullName(other))) continue;
      seen.add(other.id);
      push(
        {
          userId: other.id,
          membershipId: null,
          source: other.role === 'attorney' ? 'attorney' : 'client',
          name: fullName(other) || '—',
          role: null,
          phone: null,
          email: null,
        },
        other.avatar_file_id,
      );
    }

    if (q.length >= 2) {
      const found = await this.prisma.user.findMany({
        where: {
          role: 'attorney',
          deleted_at: null,
          status: 'active',
          id: { notIn: [...seen] },
          full_name_lower: { contains: q },
        },
        take: 10,
        ...PERSON_USER,
      });
      for (const u of found) {
        seen.add(u.id);
        push(
          {
            userId: u.id,
            membershipId: null,
            source: 'attorney',
            name: fullName(u) || '—',
            role: null,
            phone: null,
            email: null,
          },
          u.avatar_file_id,
        );
      }
    }

    const contacts = await this.prisma.attorneyTaskPerson.findMany({
      where: { user_id: null, task: { attorney_id: user.sub } },
      orderBy: { created_at: 'desc' },
      take: 300,
      select: { name: true, role: true, phone: true, email: true },
    });
    const contactKeys = new Set<string>();
    for (const p of contacts) {
      const key = `${p.name.toLowerCase()}|${p.phone ?? ''}|${p.email ?? ''}`;
      if (contactKeys.has(key) || !match(p.name)) continue;
      if (contactKeys.size >= 50) break;
      contactKeys.add(key);
      push(
        {
          userId: null,
          membershipId: null,
          source: 'contact',
          name: p.name,
          role: p.role,
          phone: p.phone,
          email: p.email,
        },
        null,
      );
    }

    const urls = await this.files.avatarUrlsMany(avatars);
    return out.map((p, i) => {
      const av = avatars[i] ? urls.get(avatars[i]) : undefined;
      return { ...p, avatarUrl: av?.url256 ?? av?.url ?? null };
    });
  }

  // --- status ---------------------------------------------------------

  /**
   * The task moves: taken → done / not done (+ note, + a new time — the
   * task then stays open at that time), cancelled, or back to work.
   * The attorney, the assigned assistant, or the assistant who set it.
   */
  async setStatus(
    user: RequestUser,
    id: string,
    dto: UpdateTaskStatusDto,
  ): Promise<TaskDto> {
    const t = await this.own(user, id);
    this.assertMayComplete(user, t);
    await this.applyStatus(user, t, dto.status, {
      note: dto.outcomeNote,
      rescheduleTo: dto.rescheduleTo ? new Date(dto.rescheduleTo) : null,
    });
    return this.get(user, id);
  }

  /** One status change with everything that follows it: the archive,
   * the next task of a repeating series, the assistant hearing back. */
  private async applyStatus(
    user: RequestUser,
    t: TaskRow,
    status: AttorneyTaskStatus,
    opts: { note?: string; rescheduleTo?: Date | null } = {},
  ): Promise<void> {
    const reschedule =
      status === 'not_done' && opts.rescheduleTo ? opts.rescheduleTo : null;
    // A moved task stays open at its new time.
    const next: AttorneyTaskStatus = reschedule ? 'open' : status;
    const finished = FINISHED.includes(next);
    const now = new Date();
    await this.prisma.attorneyTask.update({
      where: { id: t.id },
      data: {
        status: next,
        outcome_note: opts.note ?? t.outcome_note,
        ...(reschedule
          ? {
              rescheduled_to: reschedule,
              due_at: reschedule,
              remind_at: remindAt(reschedule, t.remind_before_min),
              reminded_at: null,
            }
          : {}),
        done_at: status === 'done' || status === 'not_done' ? now : null,
        // Owner 2026-10-05: finished → the archive; back to work → out.
        archived_at: finished ? (t.archived_at ?? now) : null,
        ...(finished ? {} : { purge_notice_days: null }),
      },
    });
    if (finished && next !== 'cancelled') await this.repeatNext(t);
    const a = user.assistant;
    if (a) {
      await this.assistants.log(user, `task.${status}`, {
        type: 'task',
        id: t.id,
        summary: t.title,
      });
    } else if (next !== 'open' || reschedule) {
      await this.assistants.tellAssistant(t.created_by_membership_id, {
        taskId: t.id,
        status: next,
        ...(reschedule ? { rescheduledTo: reschedule.toISOString() } : {}),
      });
    }
  }

  /** Owner 2026-10-05: a repeating task, once finished, sets up the next
   * one (same people, places, steps unchecked) — once per task. */
  private async repeatNext(t: TaskRow): Promise<void> {
    if (t.repeat === 'none') return;
    let due = nextOccurrence(t.due_at ?? new Date(), t.repeat);
    // A long-overdue series continues from today, not from the past.
    while (due.getTime() < Date.now() - DAY_MS) {
      due = nextOccurrence(due, t.repeat);
    }
    if (t.repeat_until && due > t.repeat_until) return;
    const { count } = await this.prisma.attorneyTask.updateMany({
      where: { id: t.id, repeated_at: null },
      data: { repeated_at: new Date() },
    });
    if (count === 0) return;
    const nextDue = t.due_at ? due : null;
    await this.prisma.attorneyTask.create({
      data: {
        attorney_id: t.attorney_id,
        created_by_membership_id: t.created_by_membership_id,
        assignee_membership_id: t.assignee_membership_id,
        kind: t.kind,
        title: t.title,
        notes: t.notes,
        due_at: nextDue,
        case_id: t.case_id,
        conversation_id: t.conversation_id,
        file_ids: t.file_ids,
        priority: t.priority,
        repeat: t.repeat,
        repeat_until: t.repeat_until,
        remind_before_min: t.remind_before_min,
        remind_at: remindAt(nextDue, t.remind_before_min),
        keep_forever: t.keep_forever,
        steps: {
          create: t.steps.map((s) => ({
            position: s.position,
            kind: s.kind,
            title: s.title,
            location: s.location,
            contact_name: s.contact_name,
            contact_phone: s.contact_phone,
            contact_email: s.contact_email,
            created_by_name: s.created_by_name,
          })),
        },
        places: {
          create: t.places.map((p) => ({
            position: p.position,
            label: p.label,
            address: p.address,
          })),
        },
        people: {
          create: t.people.map((p) => ({
            position: p.position,
            user_id: p.user_id,
            role: p.role,
            name: p.name,
            phone: p.phone,
            email: p.email,
          })),
        },
      },
    });
  }

  // --- steps ----------------------------------------------------------

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
        code: ErrorCode.TASK_STEPS_LIMIT,
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
              data: {
                status: 'open',
                done_at: null,
                archived_at: null,
                purge_notice_days: null,
              },
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
   * time. Checkmarks: whoever may complete the task; moving a time is
   * planning. When every step is checked the whole task is done.
   */
  async updateStep(
    user: RequestUser,
    id: string,
    stepId: string,
    dto: UpdateTaskStepDto,
  ): Promise<TaskDto> {
    const t = await this.own(user, id);
    if (t.status === 'cancelled') throw this.closed();
    const step = t.steps.find((x) => x.id === stepId);
    if (!step) throw this.stepNotFound();
    if (dto.status) this.assertMayComplete(user, t);
    // Moving a time is planning: the tasks duty. A note goes with a
    // checkmark, or is planning on its own.
    if (dto.dueAt !== undefined) this.assertMayPlan(user);
    if (dto.note !== undefined && !dto.status) this.assertMayPlan(user);
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
    if (dto.status) {
      await this.syncTaskWithSteps(user, t, (x) =>
        x.id === stepId ? dto.status! : x.status,
      );
    }
    if (user.assistant) {
      await this.assistants.log(
        user,
        dto.status ? 'task.step.check' : 'task.step.move',
        { type: 'task', id, summary: `${t.title} · ${step.title}` },
      );
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
    if (t.status === 'cancelled') throw this.closed();
    if (!t.steps.some((x) => x.id === stepId)) throw this.stepNotFound();
    await this.prisma.attorneyTaskStep.delete({ where: { id: stepId } });
    // Removing the last open step can finish the task.
    await this.syncTaskWithSteps(
      user,
      { ...t, steps: t.steps.filter((x) => x.id !== stepId) },
      (x) => x.status,
    );
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
    user: RequestUser,
    t: TaskRow,
    statusOf: (step: TaskRow['steps'][number]) => string,
  ): Promise<void> {
    if (t.status === 'cancelled' || t.steps.length === 0) return;
    const statuses = t.steps.map(statusOf);
    const allChecked = statuses.every((x) => x === 'done' || x === 'not_done');
    if (allChecked && t.status !== 'done' && t.status !== 'not_done') {
      const status = statuses.every((x) => x === 'done') ? 'done' : 'not_done';
      await this.applyStatus(user, t, status);
    } else if (
      !allChecked &&
      (t.status === 'done' || t.status === 'not_done')
    ) {
      await this.prisma.attorneyTask.update({
        where: { id: t.id },
        data: {
          status: 'open',
          done_at: null,
          archived_at: null,
          purge_notice_days: null,
        },
      });
    }
  }

  // --- edit / delete --------------------------------------------------

  /**
   * PATCH /tasks/:id — owner 2026-10-01: a planner card stays editable
   * (title, kind, time, places, people, notes, files, priority, repeat,
   * reminder, assignee). The owner or an assistant with the tasks duty;
   * a cancelled task is closed. `places` / `people` replace the lists.
   */
  async update(
    user: RequestUser,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<TaskDto> {
    this.assertMayPlan(user);
    const t = await this.own(user, id);
    if (t.status === 'cancelled') throw this.closed();
    if (dto.caseId && !dto.clearCaseId) {
      await this.assertCaseLink(user.sub, dto.caseId);
    }
    if (dto.conversationId && !dto.clearConversation) {
      await this.assertChatLink(user.sub, dto.conversationId);
    }
    if (dto.assigneeMembershipId && !dto.clearAssignee) {
      await this.assertAssignee(user.sub, dto.assigneeMembershipId);
    }
    if (dto.fileIds) {
      dto.fileIds = [...new Set(dto.fileIds)];
      await this.assertFileCount(dto.fileIds.length, t.file_ids.length);
      for (const f of dto.fileIds) {
        await this.files.assertAttachable(user.sub, f, ['task_attachment']);
      }
    }
    const places = dto.places ?? this.legacyPlaceEdit(t, dto);
    const people = dto.people ?? this.legacyContactEdit(t, dto);
    const peopleRows = people
      ? await this.peopleData(user.sub, people)
      : undefined;

    const blank = (v?: string) => (v === undefined ? undefined : v || null);
    const due = dto.clearDueAt
      ? null
      : dto.dueAt
        ? new Date(dto.dueAt)
        : t.due_at;
    const before = dto.clearRemind
      ? null
      : (dto.remindBeforeMin ?? t.remind_before_min);
    const remind = remindAt(due, before);
    const remindChanged = remind?.getTime() !== t.remind_at?.getTime();
    const assignee = dto.clearAssignee
      ? null
      : (dto.assigneeMembershipId ?? t.assignee_membership_id);
    await this.prisma.$transaction([
      ...(places
        ? [
            this.prisma.attorneyTaskPlace.deleteMany({
              where: { task_id: id },
            }),
            this.prisma.attorneyTaskPlace.createMany({
              data: this.placesData(places).map((p) => ({
                ...p,
                task_id: id,
              })),
            }),
          ]
        : []),
      ...(peopleRows
        ? [
            this.prisma.attorneyTaskPerson.deleteMany({
              where: { task_id: id },
            }),
            this.prisma.attorneyTaskPerson.createMany({
              data: peopleRows.map((p) => ({ ...p, task_id: id })),
            }),
          ]
        : []),
      this.prisma.attorneyTask.update({
        where: { id },
        data: {
          ...(dto.kind ? { kind: dto.kind } : {}),
          ...(dto.title ? { title: dto.title } : {}),
          ...(dto.notes !== undefined ? { notes: blank(dto.notes) } : {}),
          due_at: due,
          remind_before_min: before,
          remind_at: remind,
          ...(remindChanged ? { reminded_at: null } : {}),
          ...(dto.priority ? { priority: dto.priority } : {}),
          ...(dto.repeat ? { repeat: dto.repeat } : {}),
          ...(dto.clearRepeatUntil
            ? { repeat_until: null }
            : dto.repeatUntil
              ? { repeat_until: new Date(dto.repeatUntil) }
              : {}),
          assignee_membership_id: assignee,
          ...(dto.clearConversation
            ? { conversation_id: null }
            : dto.conversationId
              ? { conversation_id: dto.conversationId }
              : {}),
          ...(dto.keepForever !== undefined
            ? { keep_forever: dto.keepForever }
            : {}),
          ...(dto.fileIds ? { file_ids: [...new Set(dto.fileIds)] } : {}),
          ...(dto.clearCaseId
            ? { case_id: null }
            : dto.caseId
              ? { case_id: dto.caseId }
              : {}),
        },
      }),
    ]);
    if (user.assistant) {
      await this.assistants.log(user, 'task.edit', {
        type: 'task',
        id,
        summary: dto.title ?? t.title,
      });
    }
    await this.tellAssignee(user, id, t.assignee_membership_id, assignee);
    return this.get(user, id);
  }

  /** An older app edits the one `location`: it is the first place. */
  private legacyPlaceEdit(
    t: TaskRow,
    dto: UpdateTaskDto,
  ): TaskPlaceInputDto[] | undefined {
    if (dto.location === undefined) return undefined;
    return [
      ...(dto.location ? [{ address: dto.location }] : []),
      ...t.places
        .slice(1)
        .map((p) => ({ address: p.address, label: p.label ?? undefined })),
    ];
  }

  /** An older app edits the one contact: the first outside contact. */
  private legacyContactEdit(
    t: TaskRow,
    dto: UpdateTaskDto,
  ): TaskPersonInputDto[] | undefined {
    if (
      dto.contactName === undefined &&
      dto.contactPhone === undefined &&
      dto.contactEmail === undefined
    ) {
      return undefined;
    }
    const first = t.people.find((p) => !p.user_id);
    const phone = dto.contactPhone ?? first?.phone ?? '';
    const email = dto.contactEmail ?? first?.email ?? '';
    // A contact saved without a name was named by its number / address.
    const named =
      first && first.name !== first.phone && first.name !== first.email;
    const name =
      (dto.contactName ?? (named ? first.name : '')) || phone || email;
    return [
      ...(name ? [{ name, phone, email }] : []),
      ...t.people
        .filter((p) => p !== first)
        .map((p) => ({
          userId: p.user_id ?? undefined,
          name: p.name,
          role: p.role ?? undefined,
          phone: p.phone ?? undefined,
          email: p.email ?? undefined,
        })),
    ];
  }

  /**
   * DELETE /tasks/:id — the owner deletes any task; an assistant only the
   * ones they set (with the tasks duty). Steps go with it.
   */
  async remove(user: RequestUser, id: string): Promise<void> {
    const t = await this.own(user, id);
    if (user.assistant) {
      this.assertMayPlan(user);
      if (!this.mayDelete(user, t)) {
        throw new ForbiddenException({
          code: ErrorCode.ASSISTANT_NOT_ALLOWED,
          message: 'Only the attorney deletes tasks set by others.',
        });
      }
      await this.assistants.log(user, 'task.delete', {
        type: 'task',
        id,
        summary: t.title,
      });
    }
    await this.prisma.attorneyTask.delete({ where: { id } });
  }

  /**
   * POST /tasks/bulk — owner 2026-10-05: select many → delete, archive,
   * return to work, keep forever, assign, set a status or a priority.
   * Each task follows the same rights as one at a time; the ones the
   * viewer may not change (or already so) are skipped and counted.
   */
  async bulk(
    user: RequestUser,
    dto: BulkTasksDto,
  ): Promise<BulkTasksResultDto> {
    const plans = this.plans(user);
    if (dto.action === 'assign') {
      this.assertMayPlan(user);
      await this.assertAssignee(user.sub, dto.assigneeMembershipId!);
    }
    const rows = await this.prisma.attorneyTask.findMany({
      where: { AND: [this.visible(user), { id: { in: dto.ids } }] },
      include: INCLUDE,
    });
    const allowed = rows.filter((t) => {
      switch (dto.action) {
        case 'delete':
          return this.mayDelete(user, t);
        case 'status':
          return this.mayComplete(user, t) && t.status !== dto.status;
        case 'archive':
          return (plans || this.mayComplete(user, t)) && !t.archived_at;
        case 'unarchive':
          return (
            (plans || this.mayComplete(user, t)) &&
            (!!t.archived_at || FINISHED.includes(t.status))
          );
        case 'keep':
          return plans && !t.keep_forever;
        case 'unkeep':
          return plans && t.keep_forever;
        case 'assign':
          return t.assignee_membership_id !== dto.assigneeMembershipId;
        case 'unassign':
          return plans && !!t.assignee_membership_id;
        default:
          return plans;
      }
    });
    const ids = allowed.map((t) => t.id);
    const where = { id: { in: ids } };
    const now = new Date();
    if (ids.length > 0) {
      switch (dto.action) {
        case 'delete':
          await this.prisma.attorneyTask.deleteMany({ where });
          break;
        case 'archive':
          await this.prisma.attorneyTask.updateMany({
            where,
            data: { archived_at: now },
          });
          break;
        case 'unarchive':
          // Back from the archive = back to work.
          await this.prisma.attorneyTask.updateMany({
            where,
            data: { archived_at: null, purge_notice_days: null },
          });
          await this.prisma.attorneyTask.updateMany({
            where: { id: { in: ids }, status: { in: FINISHED } },
            data: { status: 'open', done_at: null },
          });
          break;
        case 'keep':
        case 'unkeep':
          await this.prisma.attorneyTask.updateMany({
            where,
            data: { keep_forever: dto.action === 'keep' },
          });
          break;
        case 'priority':
          await this.prisma.attorneyTask.updateMany({
            where,
            data: { priority: dto.priority },
          });
          break;
        case 'assign':
        case 'unassign': {
          const to =
            dto.action === 'assign' ? (dto.assigneeMembershipId ?? null) : null;
          await this.prisma.attorneyTask.updateMany({
            where,
            data: { assignee_membership_id: to },
          });
          for (const t of allowed) {
            await this.tellAssignee(user, t.id, t.assignee_membership_id, to);
          }
          break;
        }
        case 'status':
          for (const t of allowed) await this.applyStatus(user, t, dto.status!);
          break;
      }
      if (user.assistant) {
        await this.assistants.log(user, `task.bulk.${dto.action}`, {
          type: 'task',
          summary: `${ids.length}`,
        });
      }
    }
    return { affected: ids.length, skipped: dto.ids.length - ids.length };
  }

  /** A task newly assigned to an assistant: they hear about it. */
  private async tellAssignee(
    user: RequestUser,
    taskId: string,
    before: string | null,
    after: string | null,
  ): Promise<void> {
    if (!after || after === before) return;
    if (after === user.assistant?.membershipId) return;
    const m = await this.prisma.assistantMembership.findUnique({
      where: { id: after },
      select: { assistant_user_id: true, status: true },
    });
    if (!m?.assistant_user_id || m.status !== 'active') return;
    await this.notifications.emit({
      type: 'task_assigned',
      recipientId: m.assistant_user_id,
      payload: { taskId },
    });
  }

  // --- helpers --------------------------------------------------------

  private notFound(message: string): NotFoundException {
    return new NotFoundException({ code: ErrorCode.NOT_FOUND, message });
  }

  private stepNotFound(): NotFoundException {
    return this.notFound('Step not found.');
  }

  private closed(): ConflictException {
    return new ConflictException({
      code: ErrorCode.TASK_CLOSED,
      message: 'This task was cancelled.',
    });
  }

  private async own(user: RequestUser, id: string): Promise<TaskRow> {
    const t = await this.prisma.attorneyTask.findFirst({
      where: { AND: [this.visible(user), { id }] },
      include: INCLUDE,
    });
    if (!t) throw this.notFound('Task not found.');
    return t;
  }

  private async present(
    rows: TaskRow[],
    user: RequestUser,
  ): Promise<TaskDto[]> {
    const urls = await this.files.taskFileUrls(rows.flatMap((r) => r.file_ids));
    const avatars = await this.files.avatarUrlsMany(
      rows.flatMap((r) => r.people.map((p) => p.user?.avatar_file_id)),
    );
    const purgeDays =
      rows.some((r) => r.archived_at) &&
      (await this.settings.boolean('tasks.archive_auto_purge'))
        ? await this.settings.number('tasks.archive_retention_days')
        : 0;
    const me = user.assistant?.membershipId;
    const plans = this.plans(user);
    return rows.map((t) => {
      const contact = t.people.find((p) => !p.user_id);
      return {
        id: t.id,
        kind: t.kind,
        title: t.title,
        notes: t.notes,
        dueAt: t.due_at?.toISOString() ?? null,
        // Older apps read one place / one contact: the first ones.
        location: t.places[0]?.address ?? null,
        caseId: t.case_id,
        caseTitle: t.case?.title ?? null,
        contactName: contact?.name ?? null,
        contactPhone: contact?.phone ?? null,
        contactEmail: contact?.email ?? null,
        files: t.file_ids.map((id) => ({
          fileId: id,
          url: urls.get(id)?.url ?? null,
          mime: urls.get(id)?.mime ?? null,
        })),
        status: t.status,
        outcomeNote: t.outcome_note,
        rescheduledTo: t.rescheduled_to?.toISOString() ?? null,
        createdByName: t.created_by ? nameOf(t.created_by) : null,
        // Owner 2026-10-01: the attorney deletes any task, an assistant
        // only the ones they set (mirrors remove()).
        canDelete: this.mayDelete(user, t),
        createdAt: t.created_at.toISOString(),
        doneAt: t.done_at?.toISOString() ?? null,
        steps: t.steps.map((st) => ({
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
        places: t.places.map((p) => ({
          id: p.id,
          label: p.label,
          address: p.address,
        })),
        people: t.people.map((p) => {
          const av = p.user?.avatar_file_id
            ? avatars.get(p.user.avatar_file_id)
            : undefined;
          const role = p.user?.role;
          return {
            id: p.id,
            userId: p.user_id,
            userRole:
              role === 'attorney' || role === 'client' || role === 'assistant'
                ? role
                : null,
            avatarUrl: av?.url256 ?? av?.url ?? null,
            name: (p.user && fullName(p.user)) || p.name,
            role: p.role,
            phone: p.phone,
            email: p.email,
          };
        }),
        priority: t.priority,
        repeat: t.repeat,
        repeatUntil: t.repeat_until?.toISOString() ?? null,
        remindBeforeMin: t.remind_before_min,
        assigneeMembershipId: t.assignee_membership_id,
        assigneeName: t.assignee ? nameOf(t.assignee) : null,
        assignedToMe: !!me && t.assignee_membership_id === me,
        conversationId: t.conversation_id,
        archivedAt: t.archived_at?.toISOString() ?? null,
        keepForever: t.keep_forever,
        purgeAt:
          t.archived_at && purgeDays > 0 && !t.keep_forever
            ? new Date(
                t.archived_at.getTime() + purgeDays * DAY_MS,
              ).toISOString()
            : null,
        canComplete: this.mayComplete(user, t),
        canEdit: plans && t.status !== 'cancelled',
      };
    });
  }
}
