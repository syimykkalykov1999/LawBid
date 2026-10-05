/**
 * Owner 2026-10-05 («Продвижение» → demo world): fills the SEPARATE demo
 * database (same Prisma schema) with realistic, invented data so bloggers
 * can record promo videos as a client, an attorney or an assistant.
 *
 * The lead passes a raw `PrismaClient` bound to the demo database. The
 * reference tables (states, practice_areas, countries, plans, plan_prices,
 * feature_flags, app_config, legal_documents, i18n) are already mirrored
 * from the real database before the seed runs — they are only read here.
 *
 * Nothing here references S3 files, Stripe ids or Bunny videos: avatars
 * are empty, posts are text with hashtags, subscriptions have no Stripe id.
 *
 * Everything is built in memory first (ids generated up front), then
 * written with `createMany` in dependency order, in small chunks — no
 * single giant transaction (CockroachDB). A tiny seeded PRNG (mulberry32)
 * makes the world look the same after every reset.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ASSISTANT_DUTIES } from '../assistants/assistant-duties';
import {
  ASSISTANT_TASKS,
  BID_MESSAGES,
  CHAT_SCRIPTS,
  DEMO_ATTORNEYS,
  DEMO_CASES,
  DEMO_CLIENTS,
  DEMO_WORLD_ASSISTANT,
  EXTRA_BIOS,
  EXTRA_FIRMS,
  EXTRA_FIRST_NAMES,
  EXTRA_LAST_NAMES,
  POST_TEXTS,
  PRE_ACCEPTANCE_SCRIPTS,
  REVIEW_BODIES,
  REVIEW_REPLIES,
  TASK_TEMPLATES,
  US_CITIES,
  type DemoAttorneySpec,
  type DemoCaseSpec,
  type DemoCaseStage,
  type DemoClientSpec,
  type DemoTaskSpec,
} from './demo-seed.data';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DemoUserInput {
  role: 'client' | 'attorney' | 'assistant';
  firstName?: string;
  lastName?: string;
}

export interface DemoUserResult {
  userId: string;
  displayName: string;
  role: DemoUserInput['role'];
}

export const DEMO_EMAIL_DOMAIN = 'demo.lawbid.invalid';
export const DEMO_SHOWCASE_ATTORNEY_USERNAME = 'emily.carter';

/** The world's PRNG seed: the same world after every reset. */
const WORLD_SEED = 0x1a2b3c4d;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
/** Notification aggregation window (docs/05 §9.4) — mirrors notification-rules. */
const AGGREGATION_WINDOW_MS = HOUR_MS;

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------

class Rng {
  private state: number;

  constructor(
    seed: number,
    /** `seeded`: ids come from the PRNG (the world); `crypto`: random ids
     * (accounts created on demand must never collide with the world). */
    private readonly ids: 'seeded' | 'crypto',
  ) {
    this.state = seed >>> 0;
  }

  /** mulberry32 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  hex(len: number): string {
    let s = '';
    while (s.length < len) {
      s += Math.floor(this.next() * 0x100000000)
        .toString(16)
        .padStart(8, '0');
    }
    return s.slice(0, len);
  }

  digits(len: number): string {
    let s = '';
    for (let i = 0; i < len; i++) s += this.int(0, 9).toString();
    return s;
  }

  uuid(): string {
    if (this.ids === 'crypto') return randomUUID();
    const h = this.hex(32).split('');
    h[12] = '4';
    h[16] = '89ab'[this.int(0, 3)];
    const s = h.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
}

// ---------------------------------------------------------------------------
// Reference data read from the mirrored tables
// ---------------------------------------------------------------------------

interface Refs {
  states: Set<string>;
  /** Leaves = practice areas that are nobody's parent and have a parent. */
  leaves: { id: string; code: string; parent_id: string | null }[];
  byCode: Map<string, { id: string; code: string; parent_id: string | null }>;
  planId: string | null;
  priceCents: number;
}

async function loadRefs(prisma: PrismaClient): Promise<Refs> {
  const [states, areas, plans] = await Promise.all([
    prisma.state.findMany({
      where: { country_code: 'US', is_active: true },
      select: { code: true },
    }),
    prisma.practiceArea.findMany({
      where: { is_active: true },
      select: { id: true, code: true, parent_id: true },
    }),
    prisma.plan.findMany({
      where: { audience: 'attorney', status: 'active' },
      orderBy: [{ is_default: 'desc' }, { sort: 'asc' }],
    }),
  ]);
  if (states.length === 0) {
    throw new Error('demo seed: states are not mirrored yet');
  }
  if (areas.length === 0) {
    throw new Error('demo seed: practice_areas are not mirrored yet');
  }
  const parents = new Set(
    areas.map((a) => a.parent_id).filter((p): p is string => p !== null),
  );
  const leaves = areas.filter(
    (a) => a.parent_id !== null && !parents.has(a.id),
  );
  const byCode = new Map(areas.map((a) => [a.code, a]));

  const plan = plans.find((p) => p.interval === 'month') ?? plans[0] ?? null;
  let priceCents = 9900;
  const kinds = [plan?.price_kind, 'monthly'].filter(
    (k): k is string => typeof k === 'string' && k.length > 0,
  );
  for (const kind of kinds) {
    const price = await prisma.planPrice.findFirst({
      where: { kind, active: true },
      orderBy: { created_at: 'desc' },
      select: { amount_cents: true },
    });
    if (price) {
      priceCents = price.amount_cents;
      break;
    }
  }
  return {
    states: new Set(states.map((s) => s.code)),
    leaves: leaves.length > 0 ? leaves : areas,
    byCode,
    planId: plan?.id ?? null,
    priceCents,
  };
}

// ---------------------------------------------------------------------------
// In-memory buffers written with createMany
// ---------------------------------------------------------------------------

interface Buffers {
  users: Prisma.UserCreateManyInput[];
  clientProfiles: Prisma.ClientProfileCreateManyInput[];
  attorneyProfiles: Prisma.AttorneyProfileCreateManyInput[];
  licenses: Prisma.AttorneyLicenseCreateManyInput[];
  attorneyPractices: Prisma.AttorneyPracticeAreaCreateManyInput[];
  verificationRequests: Prisma.VerificationRequestCreateManyInput[];
  trust: Prisma.AttorneyTrustCreateManyInput[];
  subscriptions: Prisma.SubscriptionCreateManyInput[];
  memberships: Prisma.AssistantMembershipCreateManyInput[];
  cases: Prisma.CaseCreateManyInput[];
  caseStates: Prisma.CaseStateCreateManyInput[];
  bids: Prisma.BidCreateManyInput[];
  offers: Prisma.BidOfferCreateManyInput[];
  conversations: Prisma.ConversationCreateManyInput[];
  participants: Prisma.ConversationParticipantCreateManyInput[];
  messages: Prisma.MessageCreateManyInput[];
  reviews: Prisma.ReviewCreateManyInput[];
  posts: Prisma.PostCreateManyInput[];
  postTags: { postId: string; tagLower: string }[];
  follows: Prisma.FollowCreateManyInput[];
  tasks: Prisma.AttorneyTaskCreateManyInput[];
  notifications: Prisma.NotificationCreateManyInput[];
  /** cases.accepted_bid_id, set after the bids exist. */
  acceptedBids: { caseId: string; bidId: string }[];
  /** conversations.last_message_*, set after the messages exist. */
  lastMessages: { conversationId: string; messageId: string; at: Date }[];
  /** Counter bumps on rows that already live in the database. */
  increments: {
    table: 'attorney' | 'client' | 'case';
    id: string;
    field: 'followers_count' | 'following_count' | 'posts_count' | 'bids_count';
    by: number;
  }[];
}

function emptyBuffers(): Buffers {
  return {
    users: [],
    clientProfiles: [],
    attorneyProfiles: [],
    licenses: [],
    attorneyPractices: [],
    verificationRequests: [],
    trust: [],
    subscriptions: [],
    memberships: [],
    cases: [],
    caseStates: [],
    bids: [],
    offers: [],
    conversations: [],
    participants: [],
    messages: [],
    reviews: [],
    posts: [],
    postTags: [],
    follows: [],
    tasks: [],
    notifications: [],
    acceptedBids: [],
    lastMessages: [],
    increments: [],
  };
}

const CHUNK = 400;

async function createChunked<T>(
  rows: T[],
  write: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK));
  }
}

async function flush(prisma: PrismaClient, b: Buffers): Promise<void> {
  await createChunked(b.users, (data) => prisma.user.createMany({ data }));
  await createChunked(b.clientProfiles, (data) =>
    prisma.clientProfile.createMany({ data }),
  );
  await createChunked(b.attorneyProfiles, (data) =>
    prisma.attorneyProfile.createMany({ data }),
  );
  await createChunked(b.licenses, (data) =>
    prisma.attorneyLicense.createMany({ data }),
  );
  await createChunked(b.attorneyPractices, (data) =>
    prisma.attorneyPracticeArea.createMany({ data }),
  );
  await createChunked(b.verificationRequests, (data) =>
    prisma.verificationRequest.createMany({ data }),
  );
  await createChunked(b.trust, (data) =>
    prisma.attorneyTrust.createMany({ data }),
  );
  await createChunked(b.subscriptions, (data) =>
    prisma.subscription.createMany({ data }),
  );
  await createChunked(b.memberships, (data) =>
    prisma.assistantMembership.createMany({ data }),
  );
  await createChunked(b.cases, (data) => prisma.case.createMany({ data }));
  await createChunked(b.caseStates, (data) =>
    prisma.caseState.createMany({ data }),
  );
  await createChunked(b.bids, (data) => prisma.bid.createMany({ data }));
  await createChunked(b.offers, (data) => prisma.bidOffer.createMany({ data }));
  await createChunked(b.acceptedBids, (chunk) =>
    prisma.$transaction(
      chunk.map((a) =>
        prisma.case.update({
          where: { id: a.caseId },
          data: { accepted_bid_id: a.bidId },
        }),
      ),
    ),
  );
  await createChunked(b.conversations, (data) =>
    prisma.conversation.createMany({ data }),
  );
  await createChunked(b.participants, (data) =>
    prisma.conversationParticipant.createMany({ data }),
  );
  await createChunked(b.messages, (data) =>
    prisma.message.createMany({ data }),
  );
  await createChunked(b.lastMessages, (chunk) =>
    prisma.$transaction(
      chunk.map((m) =>
        prisma.conversation.update({
          where: { id: m.conversationId },
          data: { last_message_id: m.messageId, last_message_at: m.at },
        }),
      ),
    ),
  );
  await createChunked(b.reviews, (data) => prisma.review.createMany({ data }));
  await createChunked(b.posts, (data) => prisma.post.createMany({ data }));

  // Tags: one row per hashtag, shared with whatever already exists.
  const tagLowers = [...new Set(b.postTags.map((t) => t.tagLower))];
  if (tagLowers.length > 0) {
    await createChunked(tagLowers, (chunk) =>
      prisma.tag.createMany({
        data: chunk.map((tag_lower) => ({ tag_lower })),
        skipDuplicates: true,
      }),
    );
    const tags = await prisma.tag.findMany({
      where: { tag_lower: { in: tagLowers } },
      select: { id: true, tag_lower: true },
    });
    const tagId = new Map(tags.map((t) => [t.tag_lower, t.id]));
    const rows: Prisma.PostTagCreateManyInput[] = [];
    for (const pt of b.postTags) {
      const id = tagId.get(pt.tagLower);
      if (id) rows.push({ post_id: pt.postId, tag_id: id });
    }
    await createChunked(rows, (data) =>
      prisma.postTag.createMany({ data, skipDuplicates: true }),
    );
  }

  await createChunked(b.follows, (data) =>
    prisma.follow.createMany({ data, skipDuplicates: true }),
  );
  await createChunked(b.tasks, (data) =>
    prisma.attorneyTask.createMany({ data }),
  );
  await createChunked(b.notifications, (data) =>
    prisma.notification.createMany({ data }),
  );

  // Counter bumps on pre-existing rows (accounts created on demand).
  const merged = new Map<string, Buffers['increments'][number]>();
  for (const inc of b.increments) {
    const key = `${inc.table}:${inc.id}:${inc.field}`;
    const prev = merged.get(key);
    if (prev) prev.by += inc.by;
    else merged.set(key, { ...inc });
  }
  await createChunked([...merged.values()], (chunk) =>
    prisma.$transaction(
      chunk.map((inc) => {
        if (inc.table === 'case') {
          return prisma.case.updateMany({
            where: { id: inc.id },
            data: { bids_count: { increment: inc.by } },
          });
        }
        const data = { [inc.field]: { increment: inc.by } };
        return inc.table === 'attorney'
          ? prisma.attorneyProfile.updateMany({
              where: { user_id: inc.id },
              data,
            })
          : prisma.clientProfile.updateMany({
              where: { user_id: inc.id },
              data,
            });
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Builder context and records
// ---------------------------------------------------------------------------

interface AttorneyRec {
  id: string;
  first: string;
  last: string;
  username: string;
  state: string;
  city: string;
  practiceIds: Set<string>;
  /** Profile row when it is being created in this run (for counters). */
  profile: Prisma.AttorneyProfileCreateManyInput | null;
}

interface ClientRec {
  id: string;
  first: string;
  last: string;
  state: string;
  city: string;
  profile: Prisma.ClientProfileCreateManyInput | null;
}

interface CaseRec {
  id: string;
  clientId: string;
  stage: DemoCaseStage;
  createdAt: Date;
  /** The accepted bid (in progress / closed). */
  accepted: { bidId: string; attorney: AttorneyRec } | null;
  conversationId: string | null;
}

interface Ctx {
  rng: Rng;
  now: Date;
  refs: Refs;
  b: Buffers;
}

const NOTIFICATION_CATEGORY = {
  bid_received: 'bids',
  bid_accepted: 'bids',
  offer_accepted: 'bids',
  case_closed: 'cases',
  review_requested: 'cases',
  review_received: 'cases',
  new_follower: 'social',
  followed_post: 'following',
  new_case: 'new_cases',
  new_urgent_case: 'new_cases',
  assistant_joined: 'system',
  task_reminder: 'cases',
  task_assigned: 'cases',
  verification_update: 'system',
} as const satisfies Partial<
  Record<
    Prisma.NotificationCreateManyInput['type'],
    Prisma.NotificationCreateManyInput['category']
  >
>;

type DemoNotificationType = keyof typeof NOTIFICATION_CATEGORY;

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

function addMs(d: Date, ms: number): Date {
  return new Date(d.getTime() + ms);
}

function dateOnly(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function displayNameOf(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20);
}

function hashtagsOf(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

function stateOr(ctx: Ctx, code: string, fallback = 'NY'): string {
  if (ctx.refs.states.has(code)) return code;
  if (ctx.refs.states.has(fallback)) return fallback;
  return [...ctx.refs.states][0];
}

function leafFor(ctx: Ctx, code: string): { id: string; code: string } {
  const exact = ctx.refs.byCode.get(code);
  if (exact && ctx.refs.leaves.some((l) => l.id === exact.id)) return exact;
  // Same category, any leaf — else any leaf.
  const category = code.split('.')[0];
  const sibling = ctx.refs.leaves.find((l) =>
    l.code.startsWith(`${category}.`),
  );
  return sibling ?? ctx.rng.pick(ctx.refs.leaves);
}

function notify(
  ctx: Ctx,
  userId: string,
  type: DemoNotificationType,
  payload: Prisma.InputJsonObject,
  at: Date,
  opts: { read?: boolean; dedupeKey?: string; count?: number } = {},
): void {
  ctx.b.notifications.push({
    id: ctx.rng.uuid(),
    user_id: userId,
    type,
    category: NOTIFICATION_CATEGORY[type],
    payload,
    created_at: at,
    read_at: opts.read ? addMs(at, ctx.rng.int(5, 600) * MINUTE_MS) : null,
    dedupe_key: opts.dedupeKey ?? null,
    aggregate_count: opts.count ?? 1,
  });
}

function bump(
  ctx: Ctx,
  rec: AttorneyRec | ClientRec,
  table: 'attorney' | 'client',
  field: 'followers_count' | 'following_count' | 'posts_count',
  by = 1,
): void {
  const row = rec.profile as Record<string, unknown> | null;
  if (row) {
    row[field] = Number(row[field] ?? 0) + by;
    return;
  }
  ctx.b.increments.push({ table, id: rec.id, field, by });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function addUser(
  ctx: Ctx,
  input: {
    role: 'client' | 'attorney' | 'assistant';
    first: string;
    last: string;
    createdAt: Date;
  },
): string {
  const id = ctx.rng.uuid();
  const lastActive = addMs(ctx.now, -ctx.rng.int(2, 36 * 60) * MINUTE_MS);
  ctx.b.users.push({
    id,
    role: input.role,
    status: 'active',
    first_name: input.first,
    last_name: input.last,
    avatar_file_id: null,
    email: `demo-${ctx.rng.hex(12)}@${DEMO_EMAIL_DOMAIN}`,
    email_verified_at: input.createdAt,
    phone_e164: null,
    ui_language: 'en',
    theme: 'system',
    country_code: 'US',
    last_active_at: lastActive,
    created_at: input.createdAt,
    updated_at: lastActive,
  });
  return id;
}

function addClient(ctx: Ctx, spec: DemoClientSpec, createdAt: Date): ClientRec {
  const id = addUser(ctx, { role: 'client', ...spec, createdAt });
  const state = stateOr(ctx, spec.state);
  const username = `${slug(spec.first)}.${slug(spec.last)}${ctx.rng.digits(2)}`;
  const profile: Prisma.ClientProfileCreateManyInput = {
    user_id: id,
    state_code: state,
    preferred_languages: spec.languages,
    preferred_contact_method: ctx.rng.pick([
      'in_app_chat',
      'in_app_chat',
      'email',
      'call',
      'sms',
    ] as const),
    preferred_contact_note: ctx.rng.chance(0.4)
      ? ctx.rng.pick([
          'Weekdays after 6 pm work best.',
          'Please message first, I am often in meetings.',
          'Text is fine any time.',
        ])
      : null,
    username,
    username_lower: username.toLowerCase(),
    posts_count: 0,
    followers_count: 0,
    following_count: 0,
    rating_avg: 0,
    rating_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
  };
  ctx.b.clientProfiles.push(profile);
  return {
    id,
    first: spec.first,
    last: spec.last,
    state,
    city: spec.city,
    profile,
  };
}

function addAttorney(
  ctx: Ctx,
  spec: DemoAttorneySpec,
  opts: { showcase?: boolean; seats?: number; createdAt?: Date } = {},
): AttorneyRec {
  const createdAt = opts.createdAt ?? daysAgo(ctx.now, ctx.rng.int(45, 60));
  const id = addUser(ctx, {
    role: 'attorney',
    first: spec.first,
    last: spec.last,
    createdAt,
  });
  const verifiedAt = addMs(createdAt, ctx.rng.int(1, 3) * DAY_MS);
  const state = stateOr(ctx, spec.state);

  const profile: Prisma.AttorneyProfileCreateManyInput = {
    user_id: id,
    username: spec.username,
    username_lower: spec.username.toLowerCase(),
    bio: spec.bio.slice(0, 300),
    firm_name: spec.firm,
    firm_names: [spec.firm],
    languages: spec.languages,
    verification_status: 'verified',
    verified_at: verifiedAt,
    verified_first_name: spec.first,
    verified_last_name: spec.last,
    name_mismatch: false,
    rating_avg: spec.ratingAvg,
    rating_count: spec.ratingCount,
    posts_count: 0,
    followers_count: 0,
    following_count: 0,
    trust_level: opts.showcase ? 3 : 2,
    trust_badge: true,
    created_at: createdAt,
    updated_at: verifiedAt,
  };
  ctx.b.attorneyProfiles.push(profile);

  // Licences: the home state, plus a second one when the spec has it.
  const licenceStates = [state];
  if (spec.secondState && ctx.refs.states.has(spec.secondState)) {
    licenceStates.push(spec.secondState);
  }
  for (const code of licenceStates) {
    ctx.b.licenses.push({
      id: ctx.rng.uuid(),
      attorney_id: id,
      state_code: code,
      bar_number: `${code}-${ctx.rng.digits(7)}`,
      license_status: 'verified',
      expires_at: dateOnly(addMs(ctx.now, ctx.rng.int(400, 900) * DAY_MS)),
      verified_at: verifiedAt,
      auto_check_result: { source: 'demo', result: 'match' },
      created_at: createdAt,
      updated_at: verifiedAt,
    });
  }

  // Practice areas: leaves from the spec (or random leaves).
  const practiceIds = new Set<string>();
  const wanted = spec.practices.length > 0 ? spec.practices : [];
  for (const code of wanted) practiceIds.add(leafFor(ctx, code).id);
  while (practiceIds.size < 2)
    practiceIds.add(ctx.rng.pick(ctx.refs.leaves).id);
  for (const practice_area_id of practiceIds) {
    ctx.b.attorneyPractices.push({
      attorney_id: id,
      practice_area_id,
      created_at: createdAt,
    });
  }

  const requestId = ctx.rng.uuid();
  ctx.b.verificationRequests.push({
    id: requestId,
    attorney_id: id,
    status: 'approved',
    provider: 'manual',
    submitted_at: createdAt,
    reviewed_at: verifiedAt,
    attested_at: createdAt,
    attestation_version: '2026-10-04',
    created_at: createdAt,
    updated_at: verifiedAt,
  });

  ctx.b.trust.push({
    attorney_id: id,
    level: opts.showcase ? 3 : 2,
    license_confirmed_at: verifiedAt,
    license_confirmed_by: 'staff',
    license_confirmed_note: 'Bar registry page checked by a verifier.',
    documents_verified_at: verifiedAt,
    ...(opts.showcase
      ? {
          stripe_kyc_at: addMs(verifiedAt, DAY_MS),
          stripe_charges_enabled: true,
          stripe_legal_name: displayNameOf(spec.first, spec.last),
          stripe_business_type: 'individual',
          name_check: 'match',
          name_checked_at: addMs(verifiedAt, DAY_MS),
        }
      : { name_check: 'unknown' }),
    staff_cleared_at: verifiedAt,
    staff_cleared_note: 'Demo world: cleared at seed time.',
    computed_at: verifiedAt,
    created_at: createdAt,
    updated_at: verifiedAt,
  });

  const periodStart = daysAgo(ctx.now, ctx.rng.int(3, 27));
  ctx.b.subscriptions.push({
    id: ctx.rng.uuid(),
    user_id: id,
    stripe_subscription_id: null,
    status: 'active',
    price_cents: ctx.refs.priceCents,
    current_period_start: periodStart,
    current_period_end: addMs(periodStart, 30 * DAY_MS),
    plan: 'monthly',
    assistant_seats: opts.seats ?? (ctx.rng.chance(0.3) ? 1 : 0),
    plan_id: ctx.refs.planId,
    created_at: createdAt,
    updated_at: periodStart,
  });

  notify(
    ctx,
    id,
    'verification_update',
    { kind: 'approved', requestId, partial: false },
    verifiedAt,
    { read: true },
  );

  return {
    id,
    first: spec.first,
    last: spec.last,
    username: spec.username,
    state,
    city: spec.city,
    practiceIds,
    profile,
  };
}

function addAssistant(
  ctx: Ctx,
  attorney: AttorneyRec,
  first: string,
  last: string,
  createdAt: Date,
): { userId: string; membershipId: string } {
  const userId = addUser(ctx, { role: 'assistant', first, last, createdAt });
  const membershipId = ctx.rng.uuid();
  const joinedAt = addMs(createdAt, ctx.rng.int(10, 120) * MINUTE_MS);
  ctx.b.memberships.push({
    id: membershipId,
    attorney_id: attorney.id,
    assistant_user_id: userId,
    phone_e164: null,
    display_name: displayNameOf(first, last),
    status: 'active',
    approval: 'attorney_added',
    duties: [...ASSISTANT_DUTIES],
    created_at: createdAt,
    joined_at: joinedAt,
  });
  notify(ctx, attorney.id, 'assistant_joined', { membershipId }, joinedAt, {
    read: ctx.rng.chance(0.5),
  });
  return { userId, membershipId };
}

// ---------------------------------------------------------------------------
// Cases, bids, chats, reviews
// ---------------------------------------------------------------------------

function pickBidders(
  ctx: Ctx,
  practiceId: string,
  pool: readonly AttorneyRec[],
  count: number,
  first?: AttorneyRec,
): AttorneyRec[] {
  const out: AttorneyRec[] = first ? [first] : [];
  const taken = new Set(out.map((a) => a.id));
  const matching = ctx.rng.shuffle(
    pool.filter((a) => !taken.has(a.id) && a.practiceIds.has(practiceId)),
  );
  const others = ctx.rng.shuffle(
    pool.filter((a) => !taken.has(a.id) && !a.practiceIds.has(practiceId)),
  );
  for (const a of [...matching, ...others]) {
    if (out.length >= count) break;
    out.push(a);
  }
  return out;
}

interface BidInput {
  caseId: string;
  caseCreatedAt: Date;
  budgetCents: number | null;
  practiceId: string;
  caseState: string;
  attorney: AttorneyRec;
  status: 'active' | 'accepted' | 'rejected_auto';
  decidedAt: Date | null;
}

function addBid(ctx: Ctx, input: BidInput): { id: string; createdAt: Date } {
  const id = ctx.rng.uuid();
  // Never in the future: an open case may be only a day old.
  const createdAt = new Date(
    Math.min(
      addMs(input.caseCreatedAt, ctx.rng.int(1, 72) * HOUR_MS).getTime(),
      ctx.now.getTime() - 2 * HOUR_MS,
    ),
  );
  const feeType = ctx.rng.pick([
    'fixed',
    'fixed',
    'fixed',
    'hourly',
    'free_consultation',
  ] as const);
  const base = input.budgetCents ?? ctx.rng.int(15, 60) * 10_000;
  const amount =
    feeType === 'fixed'
      ? Math.max(
          50_000,
          Math.round((base * ctx.rng.int(80, 125)) / 100 / 5000) * 5000,
        )
      : feeType === 'hourly'
        ? ctx.rng.int(25, 55) * 1000
        : 0;
  const availability = ctx.rng.pick([
    'immediately',
    'immediately',
    'within_week',
    'custom_date',
  ] as const);
  const updatedAt = input.decidedAt ?? createdAt;
  ctx.b.bids.push({
    id,
    case_id: input.caseId,
    attorney_id: input.attorney.id,
    status: input.status,
    fee_type: feeType,
    amount_cents: amount,
    message: ctx.rng.pick(BID_MESSAGES),
    start_availability: availability,
    start_date:
      availability === 'custom_date'
        ? dateOnly(addMs(createdAt, ctx.rng.int(5, 20) * DAY_MS))
        : null,
    estimated_duration_days: ctx.rng.int(2, 16) * 7,
    round_count: 0,
    turn: 'client',
    outside_practice: !input.attorney.practiceIds.has(input.practiceId),
    outside_licensed_states: input.attorney.state !== input.caseState,
    decided_at: input.decidedAt,
    created_at: createdAt,
    updated_at: updatedAt,
  });
  ctx.b.offers.push({
    id: ctx.rng.uuid(),
    bid_id: id,
    round_no: 0,
    from_role: 'attorney',
    fee_type: feeType,
    amount_cents: amount,
    message: null,
    status:
      input.status === 'active'
        ? 'pending'
        : input.status === 'accepted'
          ? 'accepted'
          : 'superseded',
    created_at: createdAt,
  });
  return { id, createdAt };
}

interface ConversationInput {
  caseId: string;
  attorney: AttorneyRec;
  clientId: string;
  bidId: string;
  status: 'pre_acceptance' | 'active' | 'closed';
  script: readonly string[];
  /** Who wrote script[0]. */
  firstSender: 'attorney' | 'client';
  startAt: Date;
  /** Average gap between messages, in minutes. */
  gapMinutes: number;
  /** Leave the last message unread for its recipient. */
  unreadForRecipient?: boolean;
}

function addConversation(ctx: Ctx, input: ConversationInput): string {
  const id = ctx.rng.uuid();
  const messages: { id: string; senderId: string; at: Date }[] = [];
  const startAt = new Date(
    Math.min(
      input.startAt.getTime(),
      ctx.now.getTime() - (input.script.length + 1) * MINUTE_MS,
    ),
  );
  let at = startAt;
  input.script.forEach((line, i) => {
    // Keep the dialogue in the past, in order.
    const cap = ctx.now.getTime() - (input.script.length - i) * MINUTE_MS;
    if (at.getTime() > cap) at = new Date(cap);
    const fromAttorney = (i % 2 === 0) === (input.firstSender === 'attorney');
    const senderId = fromAttorney ? input.attorney.id : input.clientId;
    const mid = ctx.rng.uuid();
    messages.push({ id: mid, senderId, at });
    ctx.b.messages.push({
      id: mid,
      conversation_id: id,
      sender_id: senderId,
      type: 'text',
      body_original: line,
      body_display: line,
      contact_masked: false,
      client_message_id: ctx.rng.uuid(),
      created_at: at,
      updated_at: at,
    });
    at = addMs(
      at,
      Math.max(1, Math.round(input.gapMinutes * (0.3 + ctx.rng.next() * 1.4))) *
        MINUTE_MS,
    );
  });
  const last = messages[messages.length - 1];
  const beforeLast = messages[messages.length - 2] ?? last;
  ctx.b.conversations.push({
    id,
    case_id: input.caseId,
    attorney_id: input.attorney.id,
    client_id: input.clientId,
    bid_id: input.bidId,
    status: input.status,
    contacts_unlocked: input.status !== 'pre_acceptance',
    request_status: 'none',
    created_at: startAt,
    updated_at: last.at,
  });
  for (const userId of [input.attorney.id, input.clientId]) {
    const isLastSender = last.senderId === userId;
    ctx.b.participants.push({
      conversation_id: id,
      user_id: userId,
      last_read_message_id:
        isLastSender || !input.unreadForRecipient ? last.id : beforeLast.id,
      created_at: startAt,
      updated_at: last.at,
    });
  }
  ctx.b.lastMessages.push({
    conversationId: id,
    messageId: last.id,
    at: last.at,
  });
  return id;
}

function addReview(
  ctx: Ctx,
  input: {
    caseId: string | null;
    client: ClientRec;
    attorney: AttorneyRec;
    at: Date;
    withReply?: boolean;
  },
): string {
  const id = ctx.rng.uuid();
  const rating = ctx.rng.chance(0.75) ? 5 : 4;
  const reply = input.withReply ?? ctx.rng.chance(0.5);
  ctx.b.reviews.push({
    id,
    case_id: input.caseId,
    client_id: input.client.id,
    attorney_id: input.attorney.id,
    rating,
    body: ctx.rng.pick(REVIEW_BODIES),
    status: 'published',
    reply: reply ? ctx.rng.pick(REVIEW_REPLIES) : null,
    reply_at: reply
      ? new Date(
          Math.min(
            addMs(input.at, ctx.rng.int(2, 48) * HOUR_MS).getTime(),
            ctx.now.getTime() - MINUTE_MS,
          ),
        )
      : null,
    helpful_count: ctx.rng.int(0, 12),
    created_at: input.at,
    updated_at: input.at,
  });
  notify(
    ctx,
    input.attorney.id,
    'review_received',
    {
      reviewId: id,
      ...(input.caseId ? { caseId: input.caseId } : {}),
      rating,
      authorDisplayName: `${input.client.first} ${input.client.last[0]}.`,
    },
    input.at,
    { read: ctx.rng.chance(0.6) },
  );
  return id;
}

interface CaseInput {
  spec: DemoCaseSpec;
  stage: DemoCaseStage;
  client: ClientRec;
  /** Who bids; for in progress / closed the FIRST one is accepted. */
  bidders: AttorneyRec[];
  /** Case age; default from the stage. */
  createdAt?: Date;
  /** The chat script for the accepted attorney. */
  scriptIndex?: number;
}

function addCase(ctx: Ctx, input: CaseInput): CaseRec {
  const { spec, stage, client } = input;
  const id = ctx.rng.uuid();
  const createdAt =
    input.createdAt ??
    (stage === 'open'
      ? daysAgo(ctx.now, ctx.rng.int(1, 18))
      : stage === 'in_progress'
        ? daysAgo(ctx.now, ctx.rng.int(18, 38))
        : daysAgo(ctx.now, ctx.rng.int(38, 58)));
  const leaf = leafFor(ctx, spec.practice);
  const state = stateOr(ctx, spec.state, client.state);
  const byDate = spec.urgency === 'by_date';
  const deadline = byDate
    ? dateOnly(addMs(ctx.now, (spec.deadlineInDays ?? 14) * DAY_MS))
    : null;

  // Bids first: the accepted one decides the case's later dates.
  const bidsCreated: { id: string; attorney: AttorneyRec; createdAt: Date }[] =
    [];
  let acceptedAt: Date | null = null;
  if (stage !== 'open') {
    acceptedAt = addMs(createdAt, ctx.rng.int(3, 6) * DAY_MS);
  }
  input.bidders.forEach((attorney, i) => {
    const status =
      stage === 'open' ? 'active' : i === 0 ? 'accepted' : 'rejected_auto';
    const bid = addBid(ctx, {
      caseId: id,
      caseCreatedAt: createdAt,
      budgetCents: spec.budgetCents,
      practiceId: leaf.id,
      caseState: state,
      attorney,
      status,
      decidedAt: acceptedAt,
    });
    bidsCreated.push({ id: bid.id, attorney, createdAt: bid.createdAt });
    notify(
      ctx,
      client.id,
      'bid_received',
      { caseId: id, bidId: bid.id, attorneyId: attorney.id },
      bid.createdAt,
      { read: stage !== 'open' || ctx.rng.chance(0.4) },
    );
  });

  const accepted = bidsCreated[0] && stage !== 'open' ? bidsCreated[0] : null;
  const closedAt =
    stage === 'closed' && acceptedAt
      ? addMs(acceptedAt, ctx.rng.int(8, 20) * DAY_MS)
      : null;
  const lastActivity =
    closedAt ??
    (bidsCreated.length > 0
      ? bidsCreated[bidsCreated.length - 1].createdAt
      : createdAt);

  ctx.b.cases.push({
    id,
    client_id: client.id,
    title: spec.title.slice(0, 120),
    description: spec.description.slice(0, 5000),
    practice_area_id: leaf.id,
    primary_state_code: state,
    city: spec.city,
    budget_mode: spec.budgetCents === null ? 'clarify_later' : 'amount',
    budget_cents: spec.budgetCents,
    cover_key: `art:${ctx.rng.int(0, 3)}`,
    urgency: spec.urgency,
    deadline_at: deadline,
    deadline_kind: byDate ? (spec.deadlineKind ?? 'other') : null,
    status:
      stage === 'open'
        ? 'open'
        : stage === 'in_progress'
          ? 'in_progress'
          : 'closed',
    view_count: ctx.rng.int(20, 320),
    bids_count: bidsCreated.length,
    comment_count: 0,
    share_count: ctx.rng.int(0, 4),
    last_activity_at: lastActivity,
    client_completed_at: closedAt ? addMs(closedAt, -HOUR_MS * 6) : null,
    attorney_confirmed_at: closedAt,
    closed_at: closedAt,
    created_at: createdAt,
    updated_at: lastActivity,
  });
  ctx.b.caseStates.push({ case_id: id, state_code: state, is_primary: true });

  let conversationId: string | null = null;
  if (accepted && acceptedAt) {
    ctx.b.acceptedBids.push({ caseId: id, bidId: accepted.id });
    notify(
      ctx,
      accepted.attorney.id,
      'bid_accepted',
      { caseId: id, bidId: accepted.id },
      acceptedAt,
      { read: stage === 'closed' || ctx.rng.chance(0.5) },
    );
    const script =
      CHAT_SCRIPTS[
        (input.scriptIndex ?? ctx.rng.int(0, 99)) % CHAT_SCRIPTS.length
      ];
    conversationId = addConversation(ctx, {
      caseId: id,
      attorney: accepted.attorney,
      clientId: client.id,
      bidId: accepted.id,
      status: stage === 'closed' ? 'closed' : 'active',
      script: stage === 'closed' ? script.slice(0, 8) : script,
      firstSender: 'attorney',
      startAt: addMs(acceptedAt, 20 * MINUTE_MS),
      gapMinutes: stage === 'closed' ? 6 * 60 : 10 * 60,
      unreadForRecipient: stage === 'in_progress',
    });
  } else {
    // Open case: the client already talks to one or two bidders.
    const chatting = bidsCreated.slice(
      0,
      ctx.rng.int(1, Math.min(2, bidsCreated.length)),
    );
    chatting.forEach((bid, i) => {
      addConversation(ctx, {
        caseId: id,
        attorney: bid.attorney,
        clientId: client.id,
        bidId: bid.id,
        status: 'pre_acceptance',
        script:
          PRE_ACCEPTANCE_SCRIPTS[
            (i + ctx.rng.int(0, 2)) % PRE_ACCEPTANCE_SCRIPTS.length
          ],
        firstSender: 'client',
        startAt: addMs(bid.createdAt, ctx.rng.int(1, 12) * HOUR_MS),
        gapMinutes: 90,
        unreadForRecipient: true,
      });
    });
  }

  if (stage === 'closed' && accepted && closedAt) {
    notify(ctx, client.id, 'case_closed', { caseId: id }, closedAt, {
      read: true,
    });
    notify(
      ctx,
      client.id,
      'review_requested',
      { caseId: id, attorneyId: accepted.attorney.id, reminder: false },
      addMs(closedAt, 5 * MINUTE_MS),
      { read: true },
    );
    addReview(ctx, {
      caseId: id,
      client,
      attorney: accepted.attorney,
      at: addMs(closedAt, ctx.rng.int(4, 40) * HOUR_MS),
    });
  }

  return {
    id,
    clientId: client.id,
    stage,
    createdAt,
    accepted: accepted
      ? { bidId: accepted.id, attorney: accepted.attorney }
      : null,
    conversationId,
  };
}

// ---------------------------------------------------------------------------
// Posts, follows, tasks
// ---------------------------------------------------------------------------

function addPosts(
  ctx: Ctx,
  attorney: AttorneyRec,
  count: number,
  startIndex: number,
  followers: readonly ClientRec[] = [],
): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const spec = POST_TEXTS[(startIndex + i) % POST_TEXTS.length];
    const id = ctx.rng.uuid();
    const at = daysAgo(ctx.now, ctx.rng.int(0, 45));
    const practice = spec.practice
      ? ctx.refs.byCode.get(spec.practice)
      : undefined;
    ctx.b.posts.push({
      id,
      author_id: attorney.id,
      title: spec.title.slice(0, 120),
      body: spec.body.slice(0, 2200),
      practice_area_id: practice?.id ?? null,
      kind: 'post',
      video_asset_id: null,
      language: 'en',
      comments_enabled: true,
      status: 'published',
      like_count: ctx.rng.int(4, 140),
      comment_count: 0,
      save_count: ctx.rng.int(0, 20),
      share_count: ctx.rng.int(0, 9),
      created_at: at,
      updated_at: at,
    });
    for (const tag of hashtagsOf(spec.body)) {
      ctx.b.postTags.push({ postId: id, tagLower: tag });
    }
    // A couple of followers get the opt-in "followed_post" notice.
    for (const f of followers.slice(0, 2)) {
      notify(
        ctx,
        f.id,
        'followed_post',
        { postId: id, actorId: attorney.id },
        addMs(at, MINUTE_MS),
        { read: ctx.rng.chance(0.7) },
      );
    }
    ids.push(id);
  }
  bump(ctx, attorney, 'attorney', 'posts_count', count);
  return ids;
}

function addFollow(
  ctx: Ctx,
  follower: { rec: ClientRec | AttorneyRec; table: 'client' | 'attorney' },
  followee: AttorneyRec,
  at: Date,
): void {
  ctx.b.follows.push({
    follower_id: follower.rec.id,
    followee_id: followee.id,
    created_at: at,
  });
  bump(ctx, followee, 'attorney', 'followers_count');
  bump(ctx, follower.rec, follower.table, 'following_count');
}

/** One aggregated "new followers" notice, the way the service stores it. */
function notifyFollowers(
  ctx: Ctx,
  attorney: AttorneyRec,
  count: number,
  at: Date,
): void {
  if (count <= 0) return;
  const window = Math.floor(at.getTime() / AGGREGATION_WINDOW_MS);
  notify(ctx, attorney.id, 'new_follower', { actorKind: 'client' }, at, {
    dedupeKey: `new_follower:followers:${window}`,
    count,
  });
}

interface TaskInput {
  attorney: AttorneyRec;
  spec: DemoTaskSpec;
  /** Offset from now in hours (negative = past).*/
  dueInHours: number;
  status: 'open' | 'taken' | 'done' | 'not_done' | 'cancelled';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  caseId?: string | null;
  createdByMembershipId?: string | null;
  assigneeMembershipId?: string | null;
  assigneeUserId?: string | null;
  repeat?: 'none' | 'weekly' | 'monthly';
  archived?: boolean;
}

function addTask(ctx: Ctx, input: TaskInput): string {
  const id = ctx.rng.uuid();
  const dueAt = addMs(ctx.now, input.dueInHours * HOUR_MS);
  const createdAt = new Date(
    Math.min(
      addMs(dueAt, -ctx.rng.int(2, 12) * DAY_MS).getTime(),
      ctx.now.getTime() - HOUR_MS,
    ),
  );
  const finished = input.status === 'done' || input.status === 'not_done';
  const doneAt = finished
    ? addMs(dueAt, ctx.rng.int(-120, 180) * MINUTE_MS)
    : null;
  const remindBefore =
    input.spec.kind === 'court' || input.spec.kind === 'deadline'
      ? 24 * 60
      : 60;
  const remindAt = addMs(dueAt, -remindBefore * MINUTE_MS);
  const reminded = remindAt.getTime() <= ctx.now.getTime();
  ctx.b.tasks.push({
    id,
    attorney_id: input.attorney.id,
    created_by_membership_id: input.createdByMembershipId ?? null,
    assignee_membership_id: input.assigneeMembershipId ?? null,
    kind: input.spec.kind,
    title: input.spec.title,
    notes: input.spec.notes ?? null,
    due_at: dueAt,
    case_id: input.caseId ?? null,
    status: input.status,
    priority:
      input.priority ??
      ctx.rng.pick(['low', 'normal', 'normal', 'high', 'urgent'] as const),
    repeat: input.repeat ?? 'none',
    remind_before_min: remindBefore,
    remind_at: remindAt,
    reminded_at: reminded ? remindAt : null,
    outcome_note:
      input.status === 'done'
        ? ctx.rng.pick([
            'Done.',
            'Completed, notes in the file.',
            'Finished ahead of time.',
          ])
        : input.status === 'not_done'
          ? 'Rescheduled with the client.'
          : null,
    done_at: doneAt,
    archived_at: input.archived && doneAt ? addMs(doneAt, DAY_MS) : null,
    created_at: createdAt,
    updated_at: doneAt ?? createdAt,
  });
  if (reminded && input.status === 'open') {
    notify(
      ctx,
      input.attorney.id,
      'task_reminder',
      { taskId: id, kind: input.spec.kind, dueAt: dueAt.toISOString() },
      remindAt,
      { read: false },
    );
  }
  if (input.assigneeUserId) {
    notify(
      ctx,
      input.assigneeUserId,
      'task_assigned',
      { taskId: id },
      createdAt,
      { read: ctx.rng.chance(0.4) },
    );
  }
  return id;
}

/** The planner of one attorney: open, taken, done, not done, cancelled. */
function addPlanner(
  ctx: Ctx,
  attorney: AttorneyRec,
  count: number,
  caseIds: readonly string[],
  startIndex: number,
  membership?: { id: string; userId: string },
): string[] {
  const statuses: TaskInput['status'][] = [
    'open',
    'open',
    'taken',
    'done',
    'not_done',
    'open',
    'cancelled',
    'done',
    'open',
    'taken',
  ];
  const dues = [4, 28, 52, -30, -75, 96, 120, -200, 10, 170];
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const spec = TASK_TEMPLATES[(startIndex + i) % TASK_TEMPLATES.length];
    const status = statuses[i % statuses.length];
    ids.push(
      addTask(ctx, {
        attorney,
        spec,
        dueInHours: dues[i % dues.length] + ctx.rng.int(-2, 2),
        status,
        caseId:
          caseIds.length > 0 && ctx.rng.chance(0.6)
            ? ctx.rng.pick(caseIds)
            : null,
        createdByMembershipId:
          membership && ctx.rng.chance(0.3) ? membership.id : null,
        repeat: i === 1 ? 'weekly' : 'none',
        archived: status === 'done' && i >= 7,
      }),
    );
  }
  return ids;
}

function addAssistantTasks(
  ctx: Ctx,
  attorney: AttorneyRec,
  membership: { id: string; userId: string },
  caseIds: readonly string[],
): string[] {
  const dues = [6, 30, 54, -20];
  const statuses: TaskInput['status'][] = ['open', 'taken', 'open', 'done'];
  return ASSISTANT_TASKS.map((spec, i) =>
    addTask(ctx, {
      attorney,
      spec,
      dueInHours: dues[i % dues.length],
      status: statuses[i % statuses.length],
      priority: i === 0 ? 'high' : 'normal',
      caseId: caseIds.length > 0 && i % 2 === 0 ? caseIds[0] : null,
      assigneeMembershipId: membership.id,
      assigneeUserId: membership.userId,
    }),
  );
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

async function worldCounts(prisma: PrismaClient): Promise<{
  users: number;
  cases: number;
  posts: number;
  conversations: number;
}> {
  const [users, cases, posts, conversations] = await Promise.all([
    prisma.user.count({
      where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
    }),
    prisma.case.count(),
    prisma.post.count(),
    prisma.conversation.count(),
  ]);
  return { users, cases, posts, conversations };
}

/**
 * Idempotent: when the world already has demo users (any user whose email
 * ends with DEMO_EMAIL_DOMAIN), returns counts without inserting.
 */
export async function seedDemoWorld(
  prisma: PrismaClient,
  opts?: { now?: Date },
): Promise<{
  users: number;
  cases: number;
  posts: number;
  conversations: number;
}> {
  const existing = await prisma.user.count({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
  });
  if (existing > 0) return worldCounts(prisma);

  const now = opts?.now ?? new Date();
  const ctx: Ctx = {
    rng: new Rng(WORLD_SEED, 'seeded'),
    now,
    refs: await loadRefs(prisma),
    b: emptyBuffers(),
  };

  // People.
  const attorneys = DEMO_ATTORNEYS.map((spec) =>
    addAttorney(ctx, spec, {
      showcase: spec.username === DEMO_SHOWCASE_ATTORNEY_USERNAME,
      seats: spec.username === DEMO_SHOWCASE_ATTORNEY_USERNAME ? 3 : undefined,
    }),
  );
  const showcase =
    attorneys.find((a) => a.username === DEMO_SHOWCASE_ATTORNEY_USERNAME) ??
    attorneys[0];
  const clients = DEMO_CLIENTS.map((spec) =>
    addClient(ctx, spec, daysAgo(now, ctx.rng.int(8, 58))),
  );
  const assistant = addAssistant(
    ctx,
    showcase,
    DEMO_WORLD_ASSISTANT.first,
    DEMO_WORLD_ASSISTANT.last,
    daysAgo(now, 30),
  );

  // Cases: the client is the one from the case's state when there is one;
  // the showcase attorney wins two of the in-progress / closed cases.
  const cases: CaseRec[] = [];
  let scriptIndex = 0;
  let showcaseWins = 0;
  DEMO_CASES.forEach((spec, i) => {
    const sameState = clients.filter((c) => c.state === spec.state);
    const client =
      sameState.length > 0
        ? ctx.rng.pick(sameState)
        : clients[i % clients.length];
    const leaf = leafFor(ctx, spec.practice);
    let first: AttorneyRec | undefined;
    if (
      spec.stage !== 'open' &&
      showcase.practiceIds.has(leaf.id) &&
      showcaseWins < 2
    ) {
      first = showcase;
      showcaseWins++;
    } else if (spec.stage === 'open' && showcase.practiceIds.has(leaf.id)) {
      first = showcase;
    }
    const bidders = pickBidders(ctx, leaf.id, attorneys, spec.bids, first);
    cases.push(
      addCase(ctx, {
        spec,
        stage: spec.stage,
        client,
        bidders,
        scriptIndex: spec.stage === 'open' ? undefined : scriptIndex++,
      }),
    );
  });
  // Make sure the showcase attorney has at least two won cases.
  if (showcaseWins < 2) {
    const extra = DEMO_CASES.filter((c) => c.stage !== 'open').slice(
      0,
      2 - showcaseWins,
    );
    for (const spec of extra) {
      const client = ctx.rng.pick(clients);
      const leaf = leafFor(ctx, spec.practice);
      cases.push(
        addCase(ctx, {
          spec: { ...spec, title: `${spec.title} (second opinion)` },
          stage: spec.stage,
          client,
          bidders: pickBidders(ctx, leaf.id, attorneys, spec.bids, showcase),
          scriptIndex: scriptIndex++,
        }),
      );
    }
  }

  // Extra open reviews for the showcase attorney (not tied to a case).
  const reviewedShowcase = new Set(
    cases
      .filter(
        (c) => c.stage === 'closed' && c.accepted?.attorney.id === showcase.id,
      )
      .map((c) => c.clientId),
  );
  for (const client of ctx.rng.shuffle(clients).slice(0, 8)) {
    if (reviewedShowcase.has(client.id)) continue;
    reviewedShowcase.add(client.id);
    addReview(ctx, {
      caseId: null,
      client,
      attorney: showcase,
      at: daysAgo(now, ctx.rng.int(2, 55)),
    });
  }

  // Follows: every client follows the showcase attorney and a few others.
  const followersOf = new Map<string, ClientRec[]>();
  clients.forEach((client, i) => {
    const picks = new Set<AttorneyRec>([showcase]);
    for (const a of ctx.rng.shuffle(attorneys).slice(0, ctx.rng.int(2, 5)))
      picks.add(a);
    for (const a of picks) {
      addFollow(
        ctx,
        { rec: client, table: 'client' },
        a,
        daysAgo(now, ctx.rng.int(1, 50)),
      );
      const list = followersOf.get(a.id) ?? [];
      list.push(client);
      followersOf.set(a.id, list);
    }
    if (i % 4 === 0) {
      // A few attorneys follow each other too.
      const a = attorneys[i % attorneys.length];
      const b = attorneys[(i + 3) % attorneys.length];
      if (a.id !== b.id) {
        addFollow(
          ctx,
          { rec: a, table: 'attorney' },
          b,
          daysAgo(now, ctx.rng.int(1, 50)),
        );
      }
    }
  });
  for (const a of attorneys) {
    const n = followersOf.get(a.id)?.length ?? 0;
    notifyFollowers(ctx, a, Math.min(n, 3), daysAgo(now, ctx.rng.int(0, 2)));
  }

  // Posts: 3 each; the showcase attorney gets 4.
  attorneys.forEach((a, i) => {
    addPosts(
      ctx,
      a,
      a.id === showcase.id ? 4 : 3,
      i,
      followersOf.get(a.id) ?? [],
    );
  });

  // Planner: 10 tasks for the showcase attorney (some from / for the
  // assistant), 3 for everyone else.
  const wonBy = (a: AttorneyRec): string[] =>
    cases
      .filter((c) => c.stage !== 'open' && c.accepted?.attorney.id === a.id)
      .map((c) => c.id);
  attorneys.forEach((a, i) => {
    if (a.id === showcase.id) {
      addPlanner(ctx, a, 10, wonBy(a), 0, {
        id: assistant.membershipId,
        userId: assistant.userId,
      });
      addAssistantTasks(
        ctx,
        a,
        { id: assistant.membershipId, userId: assistant.userId },
        wonBy(a),
      );
    } else {
      addPlanner(ctx, a, 3, wonBy(a), i * 3);
    }
  });

  // New-case alerts for attorneys whose practice matches an open case.
  for (const c of cases.filter((c) => c.stage === 'open')) {
    const row = ctx.b.cases.find((r) => r.id === c.id);
    if (!row) continue;
    const urgent = row.urgency === 'urgent' || row.urgency === 'very_urgent';
    for (const a of attorneys.filter((a) =>
      a.practiceIds.has(row.practice_area_id),
    )) {
      notify(
        ctx,
        a.id,
        urgent ? 'new_urgent_case' : 'new_case',
        { caseId: c.id },
        addMs(c.createdAt, 2 * MINUTE_MS),
        { read: ctx.rng.chance(0.5) },
      );
    }
  }

  await flush(prisma, ctx.b);
  return worldCounts(prisma);
}

// ---------------------------------------------------------------------------
// Accounts created on demand
// ---------------------------------------------------------------------------

interface World {
  showcase: AttorneyRec;
  attorneys: AttorneyRec[];
  clients: ClientRec[];
  openCases: { id: string; practiceId: string; bidderIds: Set<string> }[];
}

async function loadWorld(prisma: PrismaClient): Promise<World> {
  const users = await prisma.user.findMany({
    where: {
      email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` },
      status: 'active',
      role: { in: ['attorney', 'client'] },
    },
    select: {
      id: true,
      role: true,
      first_name: true,
      last_name: true,
      attorney_profile: {
        select: {
          username: true,
          licenses: { select: { state_code: true }, take: 1 },
          practice_areas: { select: { practice_area_id: true } },
        },
      },
      client_profile: { select: { state_code: true } },
    },
  });
  const attorneys: AttorneyRec[] = [];
  const clients: ClientRec[] = [];
  for (const u of users) {
    if (u.role === 'attorney' && u.attorney_profile) {
      attorneys.push({
        id: u.id,
        first: u.first_name ?? '',
        last: u.last_name ?? '',
        username: u.attorney_profile.username,
        state: u.attorney_profile.licenses[0]?.state_code ?? 'NY',
        city: '',
        practiceIds: new Set(
          u.attorney_profile.practice_areas.map((p) => p.practice_area_id),
        ),
        profile: null,
      });
    } else if (u.role === 'client' && u.client_profile) {
      clients.push({
        id: u.id,
        first: u.first_name ?? '',
        last: u.last_name ?? '',
        state: u.client_profile.state_code,
        city: '',
        profile: null,
      });
    }
  }
  const showcase = attorneys.find(
    (a) => a.username.toLowerCase() === DEMO_SHOWCASE_ATTORNEY_USERNAME,
  );
  if (!showcase || clients.length === 0 || attorneys.length < 3) {
    throw new Error('demo world is not seeded yet: run seedDemoWorld first');
  }
  const open = await prisma.case.findMany({
    where: { status: 'open', deleted_at: null },
    select: {
      id: true,
      practice_area_id: true,
      bids: { select: { attorney_id: true } },
    },
    orderBy: { created_at: 'desc' },
    take: 40,
  });
  return {
    showcase,
    attorneys,
    clients,
    openCases: open.map((c) => ({
      id: c.id,
      practiceId: c.practice_area_id,
      bidderIds: new Set(c.bids.map((b) => b.attorney_id)),
    })),
  };
}

function caseSpecsFor(
  ctx: Ctx,
  attorney: AttorneyRec | null,
  stage: DemoCaseStage,
  count: number,
): DemoCaseSpec[] {
  const all = DEMO_CASES.filter((c) => c.stage === stage);
  const matching = attorney
    ? all.filter((c) => attorney.practiceIds.has(leafFor(ctx, c.practice).id))
    : [];
  const ordered = [
    ...ctx.rng.shuffle(matching),
    ...ctx.rng.shuffle(all.filter((c) => !matching.includes(c))),
  ];
  return ordered.slice(0, count);
}

/**
 * Creates ONE fully usable account of that role inside the (already
 * seeded) demo world and returns its id.
 */
export async function createDemoUser(
  prisma: PrismaClient,
  input: DemoUserInput,
  opts?: { now?: Date },
): Promise<DemoUserResult> {
  const now = opts?.now ?? new Date();
  const seed = Number.parseInt(randomUUID().slice(0, 8), 16) ^ now.getTime();
  const ctx: Ctx = {
    rng: new Rng(seed >>> 0, 'crypto'),
    now,
    refs: await loadRefs(prisma),
    b: emptyBuffers(),
  };
  const world = await loadWorld(prisma);
  const first = input.firstName?.trim() || ctx.rng.pick(EXTRA_FIRST_NAMES);
  const last = input.lastName?.trim() || ctx.rng.pick(EXTRA_LAST_NAMES);
  const displayName = displayNameOf(first, last);
  const home = ctx.rng.pick(US_CITIES);

  let userId: string;
  if (input.role === 'attorney') {
    const spec: DemoAttorneySpec = {
      first,
      last,
      username: `${slug(first)}.${slug(last)}.${ctx.rng.digits(3)}`,
      firm: ctx.rng.pick(EXTRA_FIRMS),
      city: home.city,
      state: home.state,
      secondState: home.state === 'CA' ? 'NY' : 'CA',
      bio: ctx.rng.pick(EXTRA_BIOS),
      languages: ctx.rng.chance(0.5) ? ['en', 'es'] : ['en'],
      practices: ctx.rng
        .shuffle(DEMO_ATTORNEYS)
        .slice(0, 1)
        .flatMap((a) => a.practices)
        .slice(0, 4),
      ratingAvg: 0,
      ratingCount: 0,
    };
    const me = addAttorney(ctx, spec, {
      seats: 3,
      createdAt: daysAgo(now, ctx.rng.int(30, 45)),
    });
    userId = me.id;

    // Bids on two open seeded cases.
    let placed = 0;
    for (const c of ctx.rng.shuffle(world.openCases)) {
      if (placed >= 2) break;
      if (c.bidderIds.has(me.id)) continue;
      const row = await prisma.case.findUnique({
        where: { id: c.id },
        select: {
          client_id: true,
          created_at: true,
          budget_cents: true,
          primary_state_code: true,
        },
      });
      if (!row) continue;
      const bid = addBid(ctx, {
        caseId: c.id,
        caseCreatedAt: new Date(
          Math.max(row.created_at.getTime(), now.getTime() - 3 * DAY_MS),
        ),
        budgetCents: row.budget_cents,
        practiceId: c.practiceId,
        caseState: row.primary_state_code,
        attorney: me,
        status: 'active',
        decidedAt: null,
      });
      ctx.b.increments.push({
        table: 'case',
        id: c.id,
        field: 'bids_count',
        by: 1,
      });
      notify(
        ctx,
        row.client_id,
        'bid_received',
        { caseId: c.id, bidId: bid.id, attorneyId: me.id },
        bid.createdAt,
      );
      placed++;
    }

    // Won cases: one in progress with a chat, one closed with a review.
    const won: CaseRec[] = [];
    for (const stage of ['in_progress', 'closed'] as const) {
      const spec = caseSpecsFor(ctx, me, stage, 1)[0];
      const client = ctx.rng.pick(world.clients);
      const leaf = leafFor(ctx, spec.practice);
      won.push(
        addCase(ctx, {
          spec,
          stage,
          client,
          bidders: pickBidders(ctx, leaf.id, world.attorneys, 3, me),
          scriptIndex: ctx.rng.int(0, 2),
        }),
      );
    }
    // A second review, an open one.
    const reviewer = ctx.rng.pick(
      world.clients.filter((c) => !won.some((w) => w.clientId === c.id)),
    );
    addReview(ctx, {
      caseId: null,
      client: reviewer,
      attorney: me,
      at: daysAgo(now, ctx.rng.int(1, 10)),
      withReply: true,
    });
    const ratings = ctx.b.reviews
      .filter((r) => r.attorney_id === me.id)
      .map((r) => r.rating);
    if (me.profile) {
      me.profile.rating_count = ratings.length;
      me.profile.rating_avg =
        Math.round(
          (ratings.reduce((s, r) => s + r, 0) / Math.max(1, ratings.length)) *
            100,
        ) / 100;
    }

    addPlanner(
      ctx,
      me,
      5,
      won.map((w) => w.id),
      ctx.rng.int(0, 9),
    );
    const followers = ctx.rng.shuffle(world.clients).slice(0, 6);
    addPosts(ctx, me, 3, ctx.rng.int(0, POST_TEXTS.length - 1), followers);
    for (const f of followers) {
      addFollow(
        ctx,
        { rec: f, table: 'client' },
        me,
        daysAgo(now, ctx.rng.int(0, 20)),
      );
    }
    notifyFollowers(ctx, me, 3, addMs(now, -2 * HOUR_MS));
  } else if (input.role === 'client') {
    const spec: DemoClientSpec = {
      first,
      last,
      city: home.city,
      state: home.state,
      languages: ctx.rng.chance(0.4) ? ['en', 'es'] : ['en'],
    };
    const me = addClient(ctx, spec, daysAgo(now, ctx.rng.int(20, 40)));
    userId = me.id;
    const plan: { stage: DemoCaseStage; count: number }[] = [
      { stage: 'open', count: 2 },
      { stage: 'in_progress', count: 1 },
      { stage: 'closed', count: 1 },
    ];
    for (const p of plan) {
      const specs = caseSpecsFor(ctx, null, p.stage, p.count);
      specs.forEach((caseSpec, i) => {
        const leaf = leafFor(ctx, caseSpec.practice);
        const withShowcase = world.showcase.practiceIds.has(leaf.id) || i === 0;
        const bidders = pickBidders(
          ctx,
          leaf.id,
          world.attorneys,
          p.stage === 'open' ? ctx.rng.int(3, 4) : 3,
          withShowcase ? world.showcase : undefined,
        );
        addCase(ctx, {
          spec: { ...caseSpec, state: home.state, city: home.city },
          stage: p.stage,
          client: me,
          bidders,
          scriptIndex: ctx.rng.int(0, 2),
        });
      });
    }
    const followed = new Set<AttorneyRec>([world.showcase]);
    for (const a of ctx.rng.shuffle(world.attorneys).slice(0, 3))
      followed.add(a);
    for (const a of followed) {
      addFollow(
        ctx,
        { rec: me, table: 'client' },
        a,
        daysAgo(now, ctx.rng.int(0, 15)),
      );
    }
  } else {
    const createdAt = daysAgo(now, ctx.rng.int(1, 5));
    const a = addAssistant(ctx, world.showcase, first, last, createdAt);
    userId = a.userId;
    const won = await prisma.case.findMany({
      where: {
        status: { in: ['in_progress', 'closed'] },
        accepted_bid: { attorney_id: world.showcase.id },
      },
      select: { id: true },
      take: 3,
    });
    addAssistantTasks(
      ctx,
      world.showcase,
      { id: a.membershipId, userId: a.userId },
      won.map((w) => w.id),
    );
  }

  await flush(prisma, ctx.b);
  return { userId, displayName, role: input.role };
}
