import type { PrismaClient } from '@prisma/client';

/**
 * Owner 2026-10-15: examples for «Моё › Задачи» in every state, for both
 * demo accounts — a task with sub-tasks, overdue, today, tomorrow, later in
 * the week, no date, repeating, urgent, done; the lawyer's own, one for the
 * client, a joint one, the lawyer's move (read-only for the client), one set
 * for an assistant. Dates are relative to the day the seed runs; the rows
 * are renewed every time (titles start with «Demo task:»). Local data only.
 */
const AMELIA_PHONE = '+14155552681';
const SOFIA = 'sofia.hernandez';
const PREFIX = 'Demo task:';

/** A day (offset from today) at hh:mm local time; null time = midnight. */
function at(day: number, hh = 0, mm = 0): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + day, hh, mm);
}

export async function seedTaskExamples(
  prisma: PrismaClient,
): Promise<{ planner: number; caseTasks: number }> {
  const amelia = await prisma.user.findFirst({
    where: { phone_e164: AMELIA_PHONE },
    select: { id: true },
  });
  const sofia = await prisma.attorneyProfile.findFirst({
    where: { username: SOFIA },
    select: { user_id: true },
  });
  if (!amelia || !sofia) return { planner: 0, caseTasks: 0 };

  // The cases in work of the two demo accounts (the Active examples).
  const cases = await prisma.case.findMany({
    where: {
      client_id: amelia.id,
      status: { in: ['in_progress', 'pending_completion', 'disputed'] },
      accepted_bid: { attorney_id: sofia.user_id },
    },
    orderBy: { created_at: 'asc' },
    select: { id: true, status: true },
  });
  const workCase = cases.find((c) => c.status === 'in_progress') ?? cases[0];
  const pendingCase = cases.find((c) => c.status === 'pending_completion');
  const disputeCase = cases.find((c) => c.status === 'disputed');
  const assistant = await prisma.assistantMembership.findFirst({
    where: { attorney_id: sofia.user_id, status: 'active' },
    select: { id: true },
  });

  // Renew: drop the earlier examples first.
  await prisma.attorneyTask.deleteMany({
    where: {
      attorney_id: { in: [sofia.user_id, amelia.id] },
      title: { startsWith: PREFIX },
    },
  });
  await prisma.caseTask.deleteMany({
    where: { title: { startsWith: PREFIX } },
  });

  type Step = { title: string; done?: boolean };
  const planner = async (
    owner: string,
    t: {
      title: string;
      kind?:
        | 'call'
        | 'court'
        | 'documents'
        | 'deadline'
        | 'email'
        | 'filing'
        | 'other';
      due?: Date | null;
      caseId?: string;
      steps?: Step[];
      priority?: 'normal' | 'high' | 'urgent';
      repeat?: 'none' | 'weekly';
      done?: boolean;
      assignee?: string | null;
    },
  ) => {
    await prisma.attorneyTask.create({
      data: {
        attorney_id: owner,
        kind: t.kind ?? 'documents',
        title: `${PREFIX} ${t.title}`,
        due_at: t.due ?? null,
        case_id: t.caseId ?? null,
        priority: t.priority ?? 'normal',
        repeat: t.repeat ?? 'none',
        assignee_membership_id: t.assignee ?? null,
        status: t.done ? 'done' : 'open',
        done_at: t.done ? new Date() : null,
        steps: {
          create: (t.steps ?? []).map((s, position) => ({
            position,
            title: s.title,
            status: s.done ? ('done' as const) : ('open' as const),
            done_at: s.done ? new Date() : null,
          })),
        },
      },
    });
  };

  let plannerCount = 0;
  const attorney = sofia.user_id;
  const rows: Parameters<typeof planner>[1][] = [
    {
      title: 'File the extension form with the agency',
      kind: 'filing',
      due: at(0, 14, 0),
      caseId: workCase?.id,
      priority: 'urgent',
      steps: [
        { title: 'Fill in the form', done: true },
        { title: "Attach the employer's letter", done: true },
        { title: 'Pay the fee', done: true },
        { title: 'Send by courier' },
      ],
    },
    {
      title:
        'Reply to the agency request (a long title that has to stay on two lines and not push the card out)',
      kind: 'email',
      due: at(-3, 9, 0),
      caseId: workCase?.id,
    },
    {
      title: 'Custody hearing, courtroom 4B',
      kind: 'court',
      due: at(0, 10, 0),
      caseId: pendingCase?.id ?? workCase?.id,
      priority: 'high',
      steps: [
        { title: 'Print the documents', done: true },
        { title: 'Meet the client before the hearing' },
        { title: 'Appear in court' },
      ],
    },
    {
      title: 'Call the client about the hearing results',
      kind: 'call',
      due: at(1, 9, 30),
      caseId: workCase?.id,
      assignee: assistant?.id ?? null,
    },
    {
      title: 'Check the agency reply',
      kind: 'email',
      repeat: 'weekly',
      caseId: disputeCase?.id,
    },
    {
      title: 'Send the completion statement',
      kind: 'documents',
      due: at(0, 9, 0),
      caseId: pendingCase?.id,
      done: true,
    },
    {
      title: 'Prepare the motion for a delay',
      kind: 'documents',
      due: at(4, 12, 0),
      caseId: disputeCase?.id,
    },
  ];
  for (const r of rows) {
    await planner(attorney, r);
    plannerCount += 1;
  }
  // The client's own planner.
  const clientRows: Parameters<typeof planner>[1][] = [
    {
      title: 'Gather the receipts for the lawyer',
      kind: 'documents',
      due: at(0, 18, 0),
      caseId: workCase?.id,
      steps: [
        { title: 'Medical bills', done: true },
        { title: 'Car repair' },
        { title: 'Pay stubs' },
      ],
    },
    {
      title: 'Upload a photo of the passport',
      kind: 'documents',
      due: at(-1, 12, 0),
      caseId: workCase?.id,
    },
    {
      title: 'Call the bank about the statement',
      kind: 'call',
      due: at(1, 11, 0),
    },
    { title: 'Ask a neighbour to be a witness', kind: 'other' },
  ];
  for (const r of clientRows) {
    await planner(amelia.id, r);
    plannerCount += 1;
  }

  let caseCount = 0;
  const caseTask = async (
    caseId: string | undefined,
    t: {
      kind: 'for_client' | 'shared' | 'joint';
      title: string;
      due?: Date | null;
      by: 'attorney' | 'client';
      items?: Step[];
      done?: boolean;
    },
  ) => {
    if (!caseId) return;
    const author = t.by === 'attorney' ? attorney : amelia.id;
    await prisma.caseTask.create({
      data: {
        case_id: caseId,
        kind: t.kind,
        title: `${PREFIX} ${t.title}`,
        due_at: t.due ?? null,
        created_by: author,
        status: t.done ? 'done' : 'open',
        done_at: t.done ? new Date() : null,
        done_by: t.done ? author : null,
        items: {
          create: (t.items ?? []).map((i, position) => ({
            position,
            title: i.title,
            done_at: i.done ? new Date() : null,
            done_by: i.done ? amelia.id : null,
          })),
        },
      },
    });
    caseCount += 1;
  };
  await caseTask(workCase?.id, {
    kind: 'for_client',
    title: 'Collect the documents for the lawyer',
    due: at(-2, 18, 0),
    by: 'attorney',
    items: [
      { title: 'Passport', done: true },
      { title: 'I-94', done: true },
      { title: 'Letter from work' },
      { title: 'Tax returns' },
      { title: 'Diploma with a translation' },
    ],
  });
  await caseTask(workCase?.id, {
    kind: 'joint',
    title: 'Sign the engagement letter',
    due: at(3, 16, 0),
    by: 'client',
  });
  await caseTask(workCase?.id, {
    kind: 'shared',
    title: 'The lawyer drafts the complaint',
    due: at(2, 0, 0),
    by: 'attorney',
  });
  await caseTask(workCase?.id, {
    kind: 'for_client',
    title: 'Find the lease agreement',
    due: at(1, 12, 0),
    by: 'client',
  });
  await caseTask(pendingCase?.id, {
    kind: 'joint',
    title: 'Confirm the final invoice',
    due: at(0, 17, 0),
    by: 'attorney',
    done: true,
  });
  await caseTask(disputeCase?.id, {
    kind: 'shared',
    title: 'The lawyer prepares the response to the claim',
    by: 'attorney',
  });
  return { planner: plannerCount, caseTasks: caseCount };
}
