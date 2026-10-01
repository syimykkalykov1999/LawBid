// Dev-only (owner 2026-10-01): fills the planner and the Team tab of the
// attorney @sima so the cards can be seen — the attorney's own tasks with
// checklists, tasks a demo assistant set, one done, one moved, approval
// requests and an activity log. Written straight to the DB (no sign-in, so
// the phone stays signed in). Idempotent: demo tasks carry "[demo]" in
// their notes and are replaced on every run.
//
// Usage: node scripts/seed-demo-sima.mjs   (or DEMO_USERNAME=<username>)
import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production') throw new Error('dev only');

const prisma = new PrismaClient();
const USERNAME = process.env.DEMO_USERNAME ?? 'sima';
const DEMO = '[demo]';
const now = new Date();
const at = (days, hour = 10, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const profile = await prisma.attorneyProfile.findFirst({
  where: { username_lower: USERNAME.toLowerCase() },
  select: { user_id: true },
});
if (!profile) throw new Error(`attorney @${USERNAME} not found`);
const attorneyId = profile.user_id;

// --- demo assistant -----------------------------------------------------------

const ASST_PHONE = '+13125550388';
let asst = await prisma.user.findUnique({ where: { phone_e164: ASST_PHONE } });
if (!asst) {
  asst = await prisma.user.create({
    data: {
      role: 'assistant',
      first_name: 'Aidan',
      last_name: 'Brooks',
      phone_e164: ASST_PHONE,
      phone_verified_at: now,
      identifiers: {
        create: { provider: 'phone', provider_uid: ASST_PHONE, verified_at: now },
      },
    },
  });
}
let membership = await prisma.assistantMembership.findFirst({
  where: { attorney_id: attorneyId, phone_e164: ASST_PHONE, status: { not: 'removed' } },
});
if (!membership) {
  membership = await prisma.assistantMembership.create({
    data: {
      attorney_id: attorneyId,
      phone_e164: ASST_PHONE,
      display_name: 'Aidan',
      approval: 'purchase',
      status: 'active',
      assistant_user_id: asst.id,
      joined_at: now,
      duties: ['calls', 'chats', 'files', 'cases', 'bid_drafts', 'posts', 'tasks', 'profile'],
    },
  });
}
// A seat for the assistant on the monthly plan.
await prisma.subscription.updateMany({
  where: { user_id: attorneyId, plan: 'monthly', assistant_seats: 0 },
  data: { assistant_seats: 1 },
});

// --- tasks ----------------------------------------------------------------------

await prisma.attorneyTask.deleteMany({
  where: { attorney_id: attorneyId, notes: { contains: DEMO } },
});
const kase = await prisma.case.findFirst({
  where: { accepted_bid: { attorney_id: attorneyId } },
  select: { id: true },
});

const task = (data, steps = []) =>
  prisma.attorneyTask.create({
    data: {
      attorney_id: attorneyId,
      ...data,
      notes: data.notes ? `${data.notes}\n${DEMO}` : DEMO,
      steps: { create: steps.map((s, i) => ({ position: i, ...s })) },
    },
  });

await task(
  {
    kind: 'call',
    title: 'Call back today’s new leads',
    due_at: at(0, 15, 0),
    notes: 'Three people asked about DUI defence this morning.',
  },
  [
    { kind: 'call', title: 'Michael Reyes — DUI, first offence', due_at: at(0, 15, 0), contact_name: 'Michael Reyes', contact_phone: '+13125550141', status: 'done', done_at: at(0, 15, 10) },
    { kind: 'call', title: 'Laura Kim — license suspension', due_at: at(0, 15, 30), contact_name: 'Laura Kim', contact_phone: '+13125550142' },
    { kind: 'call', title: 'Daniel Ortiz — refused breath test', due_at: at(0, 16, 0), contact_name: 'Daniel Ortiz', contact_phone: '+13125550143' },
  ],
);
await task(
  {
    kind: 'court',
    title: 'Hearing: People v. Reyes',
    due_at: at(1, 9, 30),
    location: 'Daley Center, 50 W Washington St, Courtroom 1801, Chicago',
    case_id: kase?.id ?? null,
    notes: 'Bring two copies of the motion and the police report.',
  },
  [
    { kind: 'print', title: 'Print the motion (2 copies)', due_at: at(0, 18, 0) },
    { kind: 'documents', title: 'Collect the police report from the client', due_at: at(0, 19, 0) },
    { kind: 'court', title: 'Check in with the clerk', due_at: at(1, 9, 15), location: 'Courtroom 1801' },
  ],
);
await task({
  kind: 'meeting',
  title: 'Consultation: Emma Davis (divorce)',
  due_at: at(2, 11, 0),
  location: '222 N LaSalle St, Suite 1400, Chicago',
  contact_name: 'Emma Davis',
  contact_phone: '+13125550777',
  contact_email: 'emma.davis@example.com',
});
await task(
  {
    kind: 'deadline',
    title: 'File the response before Friday',
    due_at: at(3, 17, 0),
    case_id: kase?.id ?? null,
    created_by_membership_id: membership.id,
  },
  [
    { title: 'Draft the response', due_at: at(1, 18, 0), created_by_name: 'Aidan', status: 'done', done_at: at(0, 12, 0) },
    { title: 'Review and sign', due_at: at(2, 12, 0), created_by_name: 'Aidan' },
    { title: 'File online (e-filing)', due_at: at(3, 16, 0), created_by_name: 'Aidan' },
  ],
);
await task({
  kind: 'visit',
  title: "Pick up certified copies at the clerk's office",
  due_at: at(4, 10, 0),
  location: 'Cook County Clerk, 118 N Clark St, Chicago',
  created_by_membership_id: membership.id,
  status: 'not_done',
  outcome_note: 'Clerk office closed early — moved to Friday.',
  rescheduled_to: at(4, 10, 0),
});
await task({
  kind: 'documents',
  title: 'Send the retainer agreement to the client',
  due_at: at(-1, 12, 0),
  created_by_membership_id: membership.id,
  status: 'done',
  done_at: at(-1, 12, 30),
  outcome_note: 'Sent and signed.',
});
await task({
  kind: 'other',
  title: 'Prepare next week’s post about DUI rights',
  due_at: at(5, 14, 0),
});
console.log('tasks ready');

// --- Team tab: approval requests + activity --------------------------------------

await prisma.assistantRequest.deleteMany({
  where: { attorney_id: attorneyId, membership_id: membership.id },
});
await prisma.assistantRequest.create({
  data: {
    attorney_id: attorneyId,
    membership_id: membership.id,
    kind: 'post',
    payload: {
      title: '5 things to do after a DUI stop in Illinois',
      body: '1) Stay calm 2) Do not argue at the roadside 3) Write down what happened 4) Keep every document 5) Call a lawyer before your hearing.',
      practiceCode: 'criminal_law',
      kind: 'post',
    },
  },
});
await prisma.assistantRequest.create({
  data: {
    attorney_id: attorneyId,
    membership_id: membership.id,
    kind: 'profile_edit',
    payload: { bio: 'Chicago attorney — DUI, traffic and criminal defence. Same-day answers.' },
  },
});

await prisma.assistantActivity.deleteMany({
  where: { attorney_id: attorneyId, membership_id: membership.id },
});
const minutesAgo = (m) => new Date(now.getTime() - m * 60000);
for (const [action, type, summary, m] of [
  ['task.create', 'task', 'File the response before Friday', 25],
  ['task.step.add', 'task', 'Review and sign', 22],
  ['chat.message', 'conversations', null, 40],
  ['file.upload', 'files', null, 55],
  ['bid.draft', 'cases', null, 90],
  ['task.create', 'task', "Pick up certified copies at the clerk's office", 130],
]) {
  await prisma.assistantActivity.create({
    data: {
      attorney_id: attorneyId,
      membership_id: membership.id,
      action,
      target_type: type,
      summary,
      created_at: minutesAgo(m),
    },
  });
}
console.log('team requests + activity ready');
console.log(`\nDemo assistant: Aidan Brooks ${ASST_PHONE} (code 000000)`);
await prisma.$disconnect();
