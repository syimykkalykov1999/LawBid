import type { AttorneyTaskRepeat, Prisma } from '@prisma/client';
import {
  nextOccurrenceZoned,
  safeTimeZone,
} from '../../common/utils/zoned-time';
import type { PrismaService } from '../../prisma/prisma.service';

/** A reminder time this far in the past (or more) is not sent when the
 * task is created or moved there: the moment has gone. */
const PAST_TOLERANCE_MS = 60_000;

/** What a task needs to be copied to its next time. */
export type SeriesTask = Prisma.AttorneyTaskGetPayload<{
  include: { steps: true; places: true; people: true };
}>;

/** Minutes → the push reminder's time (null without a due time). */
export function remindAtFor(
  due: Date | null,
  before: number | null,
): Date | null {
  if (!due || before === null) return null;
  return new Date(due.getTime() - before * 60_000);
}

/**
 * `reminded_at` for a task that gets this `remind_at`: a time that has
 * already passed is marked done so the minute job never sends a reminder
 * for a moment before the task existed (it would otherwise read as
 * "missed"); a future time is pending (null).
 */
export function remindedAtFor(
  remindAt: Date | null,
  now: Date = new Date(),
): Date | null {
  return remindAt && remindAt.getTime() <= now.getTime() - PAST_TOLERANCE_MS
    ? now
    : null;
}

/**
 * The zone a person's repeating tasks follow: their own time zone, else
 * the one of their quiet hours, else UTC.
 */
export async function ownerTimeZone(
  prisma: PrismaService,
  userId: string,
): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, quiet_hours: { select: { timezone: true } } },
  });
  return safeTimeZone(u?.timezone ?? u?.quiet_hours?.timezone);
}

/** Owner 2026-10-05, 2026-10-20: the next time of a repeating task, by the
 * owner's local clock (DST, local weekdays). */
export function nextOccurrence(
  from: Date,
  repeat: AttorneyTaskRepeat,
  timeZone = 'UTC',
): Date {
  return nextOccurrenceZoned(from, repeat, timeZone);
}

/**
 * Owner 2026-10-05: a repeating task sets up the next one (same people,
 * places, steps unchecked) — once per task: `repeated_at` is claimed
 * first, so a "done" mark and the minute job never both create it.
 * Owner 2026-10-20: also called by the job when the time comes, so a
 * series that is not ticked off keeps going.
 *
 * The next time is the first one after `now` (an overdue series continues
 * from today, never from the past). Returns whether a task was created.
 */
export async function createNextOccurrence(
  prisma: PrismaService,
  t: SeriesTask,
  timeZone: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (t.repeat === 'none') return false;
  const claim = new Date();
  const { count } = await prisma.attorneyTask.updateMany({
    where: { id: t.id, repeated_at: null },
    data: { repeated_at: claim },
  });
  if (count === 0) return false;
  try {
    let due = nextOccurrence(t.due_at ?? now, t.repeat, timeZone);
    for (
      let guard = 0;
      due.getTime() <= now.getTime() && guard < 4000;
      guard++
    ) {
      due = nextOccurrence(due, t.repeat, timeZone);
    }
    if (t.repeat_until && due > t.repeat_until) return false;
    const nextDue = t.due_at ? due : null;
    const remind = remindAtFor(nextDue, t.remind_before_min);
    await prisma.attorneyTask.create({
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
        remind_at: remind,
        reminded_at: remindedAtFor(remind, now),
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
    return true;
  } catch (err) {
    // Not created: the next run (or the "done" mark) tries again.
    await prisma.attorneyTask.updateMany({
      where: { id: t.id, repeated_at: claim },
      data: { repeated_at: null },
    });
    throw err;
  }
}
