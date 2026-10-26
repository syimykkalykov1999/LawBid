import type { PrismaClient } from '@prisma/client';

/**
 * Owner 2026-10-15: examples for «Моё > Мои кейсы» (client) and
 * «Мои биды» (attorney) in every state — open cases without bids and with
 * bids, completed and archived ones; waiting bids, invitations, completed
 * work, declined / withdrawn / expired bids. Idempotent: rows are looked up
 * by title (prefix «Demo mine:»). Local data only.
 */
const AMELIA_PHONE = '+14155552681';
const SOFIA = 'sofia.hernandez';
const PREFIX = 'Demo mine:';

type CaseSpec = {
  title: string;
  practice: string;
  state: string;
  budgetCents: number | null;
  status: 'open' | 'closed' | 'archived';
  /** Sofia's bid on this case, if any. */
  sofia?: {
    status:
      | 'active'
      | 'accepted'
      | 'rejected_by_client'
      | 'withdrawn'
      | 'rejected_auto';
    cents: number;
    turn?: 'client' | 'attorney';
  };
  /** Amelia invited Sofia to this case. */
  invited?: boolean;
  /** Other attorneys' bids (count) to fill the case's counter. */
  others?: string[];
};

const CASES: CaseSpec[] = [
  {
    title: `${PREFIX} open, nobody has bid yet`,
    practice: 'consumer_protection.debt_collection',
    state: 'NY',
    budgetCents: 90000,
    status: 'open',
  },
  {
    title: `${PREFIX} open, two bids, waiting for the client (a very long title that has to stay on two lines and not push the card out)`,
    practice: 'family_law.child_custody',
    state: 'FL',
    budgetCents: 300000,
    status: 'open',
    sofia: { status: 'active', cents: 280000, turn: 'client' },
    others: ['marcus.reed'],
  },
  {
    title: `${PREFIX} open, your move on the bid`,
    practice: 'criminal_defense.dui',
    state: 'AZ',
    budgetCents: null,
    status: 'open',
    sofia: { status: 'active', cents: 150000, turn: 'attorney' },
  },
  {
    title: `${PREFIX} invitation: please look at this case`,
    practice: 'immigration.work_visa',
    state: 'CA',
    budgetCents: 200000,
    status: 'open',
    invited: true,
  },
  {
    title: `${PREFIX} completed, the client left a review`,
    practice: 'real_estate.landlord_tenant',
    state: 'WA',
    budgetCents: 70000,
    status: 'closed',
    sofia: { status: 'accepted', cents: 65000 },
  },
  {
    title: `${PREFIX} archived long ago`,
    practice: 'business_and_corporate.llc_formation',
    state: 'DE',
    budgetCents: 110000,
    status: 'archived',
    sofia: { status: 'accepted', cents: 110000 },
  },
  {
    title: `${PREFIX} the client chose another attorney`,
    practice: 'traffic_tickets.parking',
    state: 'TX',
    budgetCents: 25000,
    status: 'open',
    sofia: { status: 'rejected_by_client', cents: 20000 },
  },
  {
    title: `${PREFIX} you withdrew your bid`,
    practice: 'employment_and_labor.unpaid_wages',
    state: 'NJ',
    budgetCents: 120000,
    status: 'open',
    sofia: { status: 'withdrawn', cents: 100000 },
  },
  {
    title: `${PREFIX} the bid expired without an answer`,
    practice: 'estate_planning_and_probate.wills',
    state: 'IL',
    budgetCents: 60000,
    status: 'open',
    sofia: { status: 'rejected_auto', cents: 55000 },
  },
];

export async function seedMineExamples(
  prisma: PrismaClient,
): Promise<{ created: number }> {
  const amelia = await prisma.user.findFirst({
    where: { phone_e164: AMELIA_PHONE },
    select: { id: true },
  });
  const sofia = await prisma.attorneyProfile.findFirst({
    where: { username: SOFIA },
    select: { user_id: true },
  });
  if (!amelia || !sofia) return { created: 0 };
  let created = 0;
  for (const ex of CASES) {
    const exists = await prisma.case.findFirst({
      where: { title: ex.title },
      select: { id: true },
    });
    if (exists) continue;
    // A practice that does not exist locally falls back to any one.
    const area =
      (await prisma.practiceArea.findUnique({
        where: { code: ex.practice },
        select: { id: true },
      })) ??
      (await prisma.practiceArea.findFirst({
        where: { parent_id: { not: null } },
        select: { id: true },
      }));
    if (!area) continue;
    await prisma.state.upsert({
      where: { code: ex.state },
      create: { code: ex.state, name: ex.state },
      update: {},
    });
    const c = await prisma.case.create({
      data: {
        client_id: amelia.id,
        title: ex.title,
        description: 'Example case for «Mine»: it shows how a card looks.',
        practice_area_id: area.id,
        primary_state_code: ex.state,
        budget_mode: ex.budgetCents === null ? 'clarify_later' : 'amount',
        budget_cents: ex.budgetCents,
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: ex.state, is_primary: true },
    });
    let bids = 0;
    let acceptedId: string | null = null;
    if (ex.sofia) {
      const bid = await prisma.bid.create({
        data: {
          case_id: c.id,
          attorney_id: sofia.user_id,
          status: ex.sofia.status,
          fee_type: 'fixed',
          amount_cents: ex.sofia.cents,
          message: 'Example bid for «Mine».',
          start_availability: 'immediately',
          turn: ex.sofia.turn ?? 'client',
          ...(ex.sofia.status === 'active' ? {} : { decided_at: new Date() }),
        },
      });
      // The case's counter holds the bids still waiting for the client.
      if (ex.sofia.status === 'active') bids += 1;
      if (ex.sofia.status === 'accepted') acceptedId = bid.id;
    }
    for (const username of ex.others ?? []) {
      const other = await prisma.attorneyProfile.findFirst({
        where: { username },
        select: { user_id: true },
      });
      if (!other) continue;
      await prisma.bid.create({
        data: {
          case_id: c.id,
          attorney_id: other.user_id,
          status: 'active',
          fee_type: 'fixed',
          amount_cents: (ex.budgetCents ?? 100000) - 10000,
          message: 'Example bid for «Mine».',
          start_availability: 'immediately',
          turn: 'client',
        },
      });
      bids += 1;
    }
    await prisma.case.update({
      where: { id: c.id },
      data: {
        bids_count: bids,
        ...(ex.status !== 'open'
          ? {
              status: ex.status,
              accepted_bid_id: acceptedId,
              closed_at: new Date(),
            }
          : {}),
      },
    });
    if (ex.invited) {
      await prisma.caseInvite.create({
        data: {
          case_id: c.id,
          client_id: amelia.id,
          attorney_id: sofia.user_id,
          status: 'pending',
          message: 'Could you take a look? I think this is your area.',
          expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      });
    }
    created += 1;
  }
  return { created };
}
