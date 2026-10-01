// Dev-only demo of attorney assistants (owner request 2026-09-30, OQ-048):
// an attorney with a monthly plan + 2 seats, their assistant, and a client
// with a case the attorney won — then, through the real API: posts by the
// attorney, an accepted bid with a chat (incl. an assistant message),
// tasks the assistant set (one done, one moved), the attorney's own task,
// a post and a comment waiting for approval. Idempotent by phone number.
//
// Usage (API on :3000, dev DB, OTP_DEV_FIXED_CODE=true → code 000000):
//   node scripts/seed-demo-team.mjs
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

if (process.env.NODE_ENV === 'production') throw new Error('dev only');

const API = process.env.DEMO_API ?? 'http://localhost:3000/api/v1';
const prisma = new PrismaClient();
const now = new Date();
const at = (days, hour = 10, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const ATTORNEY = {
  phone: '+13125550301',
  first: 'Olivia',
  last: 'Bennett',
  username: 'oliviabennett_law',
  state: 'IL',
  firm: 'Bennett Family Law',
  practices: ['family_law.divorce', 'family_law.child_custody'],
  bio: 'Family law attorney in Chicago. Divorce, custody and support — with a team that answers the same day.',
};
const ASSISTANT = { phone: '+13125550302', first: 'Sam', last: 'Carter' };
const CLIENT = {
  phone: '+13125550303',
  first: 'Chris',
  last: 'Walker',
  username: 'chriswalker',
  state: 'IL',
};

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function login(phone) {
  await call('POST', '/auth/otp/request', null, {
    channel: 'phone',
    identifier: phone,
  });
  const t = await call('POST', '/auth/otp/verify', null, {
    channel: 'phone',
    identifier: phone,
    code: '000000',
  });
  return t.accessToken;
}

async function upsertUser(p, role, extra = {}) {
  let user = await prisma.user.findUnique({ where: { phone_e164: p.phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        role,
        first_name: p.first,
        last_name: p.last,
        phone_e164: p.phone,
        phone_verified_at: now,
        ...extra,
        identifiers: {
          create: { provider: 'phone', provider_uid: p.phone, verified_at: now },
        },
      },
    });
  }
  const consents = await prisma.userConsent.count({ where: { user_id: user.id } });
  if (consents === 0) {
    await prisma.userConsent.createMany({
      data: ['age_18', 'terms', 'privacy', 'disclaimer'].map((t) => ({
        user_id: user.id,
        consent_type: t,
        granted: true,
      })),
    });
  }
  await prisma.onboardingState.upsert({
    where: { user_id: user.id },
    create: { user_id: user.id, completed_at: now },
    update: { completed_at: now },
  });
  return user;
}

// --- people ---------------------------------------------------------------

const att = await upsertUser(ATTORNEY, 'attorney');
await prisma.attorneyProfile.upsert({
  where: { user_id: att.id },
  create: {
    user_id: att.id,
    username: ATTORNEY.username,
    username_lower: ATTORNEY.username,
    bio: ATTORNEY.bio,
    firm_name: ATTORNEY.firm,
    firm_names: [ATTORNEY.firm],
    languages: ['en'],
    verification_status: 'verified',
    verified_at: now,
    verified_first_name: ATTORNEY.first,
    verified_last_name: ATTORNEY.last,
  },
  update: {},
});
if (!(await prisma.attorneyLicense.findFirst({ where: { attorney_id: att.id } }))) {
  await prisma.attorneyLicense.create({
    data: {
      attorney_id: att.id,
      state_code: ATTORNEY.state,
      bar_number: 'IL-6301455',
      license_status: 'verified',
      verified_at: now,
    },
  });
}
for (const code of ATTORNEY.practices) {
  const pa = await prisma.practiceArea.findUniqueOrThrow({ where: { code } });
  const has = await prisma.attorneyPracticeArea.findFirst({
    where: { attorney_id: att.id, practice_area_id: pa.id },
  });
  if (!has) {
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: att.id, practice_area_id: pa.id },
    });
  }
}
await prisma.subscription.upsert({
  where: { user_id: att.id },
  create: {
    user_id: att.id,
    status: 'active',
    plan: 'monthly',
    assistant_seats: 2,
    price_cents: 59900,
    current_period_start: now,
    current_period_end: new Date(now.getTime() + 30 * 86400000),
  },
  update: {
    status: 'active',
    plan: 'monthly',
    assistant_seats: 2,
    price_cents: 59900,
    current_period_end: new Date(now.getTime() + 30 * 86400000),
  },
});

const asst = await upsertUser(ASSISTANT, 'assistant');
let membership = await prisma.assistantMembership.findFirst({
  where: { attorney_id: att.id, phone_e164: ASSISTANT.phone, status: { not: 'removed' } },
});
if (!membership) {
  membership = await prisma.assistantMembership.create({
    data: {
      attorney_id: att.id,
      phone_e164: ASSISTANT.phone,
      display_name: 'Sam',
      approval: 'purchase',
      status: 'active',
      assistant_user_id: asst.id,
      joined_at: now,
      duties: ['calls', 'chats', 'files', 'cases', 'bid_drafts', 'posts', 'tasks', 'profile'],
    },
  });
}

const client = await upsertUser(CLIENT, 'client', {
  email: 'chriswalker@demo.lawbid.test',
  email_verified_at: now,
});
await prisma.clientProfile.upsert({
  where: { user_id: client.id },
  create: {
    user_id: client.id,
    state_code: CLIENT.state,
    preferred_languages: ['en'],
    username: CLIENT.username,
    username_lower: CLIENT.username,
  },
  update: {},
});

const attTok = await login(ATTORNEY.phone);
const asstTok = await login(ASSISTANT.phone);
const clientTok = await login(CLIENT.phone);

// --- attorney posts ---------------------------------------------------------

if ((await prisma.post.count({ where: { author_id: att.id, deleted_at: null } })) === 0) {
  await call('POST', '/posts', attTok, {
    title: 'Divorce in Illinois: how long does it take?',
    body: 'An uncontested divorce in Cook County often takes 6–8 weeks after filing. Contested cases depend on custody and property questions — plan for months, not weeks. Keep your financial records in one folder from day one.',
    practiceCode: 'family_law.divorce',
  });
  await call('POST', '/posts', attTok, {
    title: 'News: new parenting-time guidelines in Cook County',
    body: 'Cook County courts updated the parenting-time worksheet this month. If your schedule is up for review, bring the new form to mediation.',
    practiceCode: 'family_law.child_custody',
    kind: 'news',
  });
  console.log('attorney posts published');
}

// --- a case the attorney won: chat with an assistant message ------------------

let kase = await prisma.case.findFirst({ where: { client_id: client.id } });
if (!kase) {
  const pa = await prisma.practiceArea.findUniqueOrThrow({
    where: { code: 'family_law.child_custody' },
  });
  const created = await call('POST', '/cases', clientTok, {
    practiceAreaId: pa.id,
    title: 'Change custody schedule after moving near school',
    description:
      'We share custody of our 9-year-old son. I moved 5 minutes from his school and want more school nights. His mother mostly agrees but we need the modification filed properly in Cook County.',
    primaryStateCode: 'IL',
    budgetMode: 'amount',
    budgetAmountDollars: 2500,
    clientContactSharingConsent: true,
  });
  const bid = await call('POST', `/cases/${created.id}/bids`, attTok, {
    feeType: 'fixed',
    amountCents: 220000,
    message:
      'I handle custody modifications in Cook County every month. Flat fee covers the petition, the agreed order and one court appearance.',
    startAvailability: 'immediately',
  });
  await call('POST', `/bids/${bid.id}/accept`, clientTok);
  kase = await prisma.case.findUniqueOrThrow({ where: { id: created.id } });
  const conv = await prisma.conversation.findFirstOrThrow({
    where: { case_id: kase.id },
  });
  const say = (tok, body) =>
    call('POST', `/conversations/${conv.id}/messages`, tok, {
      type: 'text',
      body,
      clientMessageId: randomUUID(),
    });
  await say(attTok, 'Hi Chris, thanks for choosing me. I will draft the petition this week.');
  await say(clientTok, 'Great, thank you! What do you need from me?');
  await say(asstTok, "Hello Chris, I'm Sam, Olivia's assistant. Please send the current custody order and your son's school calendar.");
  await say(clientTok, 'Sure, I will send them tonight.');
  console.log('case + chat ready');
}

// --- tasks --------------------------------------------------------------------

if ((await prisma.attorneyTask.count({ where: { attorney_id: att.id } })) === 0) {
  const t = (tok, body) => call('POST', '/tasks', tok, body);
  await t(asstTok, {
    kind: 'call',
    title: 'Call Chris Walker about the school calendar',
    dueAt: at(0, 16, 30),
    contactName: 'Chris Walker',
    contactPhone: CLIENT.phone,
    caseId: kase.id,
  });
  await t(asstTok, {
    kind: 'court',
    title: 'Status hearing — Walker custody modification',
    dueAt: at(1, 9, 30),
    location: 'Daley Center, 50 W Washington St, Courtroom 1801, Chicago',
    caseId: kase.id,
    notes: 'Bring two copies of the agreed order.',
  });
  await t(asstTok, {
    kind: 'print',
    title: 'Print the agreed order (3 copies) and sign',
    dueAt: at(0, 18, 0),
    caseId: kase.id,
  });
  await t(asstTok, {
    kind: 'meeting',
    title: 'Meet a new client: Emma Davis (divorce consultation)',
    dueAt: at(3, 11, 0),
    location: 'Office, 222 N LaSalle St, Suite 1400',
    contactName: 'Emma Davis',
    contactPhone: '+13125550777',
  });
  await t(asstTok, {
    kind: 'deadline',
    title: 'File financial affidavit — Walker case',
    dueAt: at(5, 17, 0),
    caseId: kase.id,
  });
  const done = await t(asstTok, {
    kind: 'documents',
    title: 'Send the retainer agreement to Chris',
    dueAt: at(-1, 12, 0),
    caseId: kase.id,
  });
  await call('PATCH', `/tasks/${done.id}/status`, attTok, {
    status: 'done',
    outcomeNote: 'Sent and signed by the client.',
  });
  const moved = await t(asstTok, {
    kind: 'visit',
    title: "Pick up certified copies at the clerk's office",
    dueAt: at(-1, 15, 0),
  });
  await call('PATCH', `/tasks/${moved.id}/status`, attTok, {
    status: 'not_done',
    outcomeNote: 'Clerk office closed early — moving to Friday.',
    rescheduleTo: at(4, 10, 0),
  });
  await t(attTok, {
    kind: 'other',
    title: 'Review Sam’s draft of the monthly newsletter',
    dueAt: at(2, 14, 0),
  });
  console.log('tasks ready');
}

// --- approval requests ----------------------------------------------------------

if ((await prisma.assistantRequest.count({ where: { attorney_id: att.id } })) === 0) {
  await call('POST', '/team/requests', asstTok, {
    kind: 'post',
    payload: {
      title: '5 documents to bring to a custody consultation',
      body: '1) Current custody order 2) School calendar 3) Work schedule 4) Text messages about pickups 5) A simple calendar of the last 3 months.',
      practiceCode: 'family_law.child_custody',
      kind: 'post',
    },
  });
  const firstPost = await prisma.post.findFirst({
    where: { author_id: att.id },
    orderBy: { created_at: 'asc' },
  });
  if (firstPost) {
    await call('POST', '/team/requests', asstTok, {
      kind: 'comment',
      payload: {
        postId: firstPost.id,
        body: 'Questions? Message us — we usually answer the same day.',
      },
    });
  }
  // A bid draft for an open case, if any.
  console.log('approval requests ready');
}

console.log('\nDemo accounts (code 000000):');
console.log(`  Attorney  ${ATTORNEY.phone}  ${ATTORNEY.first} ${ATTORNEY.last}`);
console.log(`  Assistant ${ASSISTANT.phone}  ${ASSISTANT.first} ${ASSISTANT.last}`);
console.log(`  Client    ${CLIENT.phone}  ${CLIENT.first} ${CLIENT.last}`);
await prisma.$disconnect();
