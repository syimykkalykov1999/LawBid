import type { PrismaClient } from '@prisma/client';

/**
 * Owner 2026-10-15: examples for «Моё > Активные» in every state, for both
 * demo accounts — published with no bids, with bids, a price not agreed,
 * waiting for an answer, in progress, wrapping up, disputed, completed;
 * different practices, several states, long titles. Idempotent: rows are
 * looked up by title (prefix «Demo active:»). Local data only.
 */
const AMELIA_PHONE = '+14155552681';
const PREFIX = 'Demo active:';

type Example = {
  title: string;
  practice: string;
  state: string;
  extraStates?: string[];
  budgetCents: number | null;
  status: 'open' | 'in_progress' | 'pending_completion' | 'disputed' | 'closed';
  /** Usernames of attorneys who bid (the first one is accepted when the
   * case is past `open`); amounts in cents. */
  bids: { username: string; cents: number; fee?: 'fixed' | 'hourly' }[];
};

const EXAMPLES: Example[] = [
  {
    title: `${PREFIX} just published, nobody has bid yet`,
    practice: 'family_law.divorce',
    state: 'FL',
    budgetCents: 250000,
    status: 'open',
    bids: [],
  },
  {
    title: `${PREFIX} three attorneys bid, choose one (long title: a very long name that must stay on two lines at most and never push the card out)`,
    practice: 'immigration.green_card',
    state: 'NY',
    extraStates: ['NJ', 'CT'],
    budgetCents: 180000,
    status: 'open',
    bids: [
      { username: 'sofia.hernandez', cents: 150000 },
      { username: 'marcus.reed', cents: 170000 },
      { username: 'emily.carter', cents: 190000 },
    ],
  },
  {
    title: `${PREFIX} price not agreed yet, waiting for a bid`,
    practice: 'traffic_tickets.speeding',
    state: 'TX',
    budgetCents: null,
    status: 'open',
    bids: [{ username: 'sofia.hernandez', cents: 18000 }],
  },
  {
    title: `${PREFIX} in progress, hourly, two more states`,
    practice: 'employment_and_labor.wrongful_termination',
    state: 'CA',
    extraStates: ['NV', 'AZ'],
    budgetCents: 600000,
    status: 'in_progress',
    bids: [{ username: 'sofia.hernandez', cents: 25000, fee: 'hourly' }],
  },
  {
    title: `${PREFIX} work is done, waiting for confirmation`,
    practice: 'real_estate.boundary_and_easement_disputes',
    state: 'WA',
    budgetCents: 90000,
    status: 'pending_completion',
    bids: [{ username: 'sofia.hernandez', cents: 70000 }],
  },
  {
    title: `${PREFIX} a dispute is open`,
    practice: 'immigration.visa_overstay',
    state: 'DE',
    budgetCents: 220000,
    status: 'disputed',
    bids: [{ username: 'sofia.hernandez', cents: 200000 }],
  },
  {
    title: `${PREFIX} completed`,
    practice: 'business_and_corporate.contracts',
    state: 'NV',
    budgetCents: 110000,
    status: 'closed',
    bids: [{ username: 'sofia.hernandez', cents: 110000 }],
  },
];

export async function seedActiveExamples(
  prisma: PrismaClient,
): Promise<{ created: number }> {
  const amelia = await prisma.user.findFirst({
    where: { phone_e164: AMELIA_PHONE },
    select: { id: true },
  });
  if (!amelia) return { created: 0 };
  let created = 0;
  for (const ex of EXAMPLES) {
    const exists = await prisma.case.findFirst({
      where: { title: ex.title },
      select: { id: true },
    });
    if (exists) continue;
    const area = await prisma.practiceArea.findUnique({
      where: { code: ex.practice },
      select: { id: true },
    });
    if (!area) continue;
    const attorneys = await prisma.attorneyProfile.findMany({
      where: { username: { in: ex.bids.map((b) => b.username) } },
      select: { user_id: true, username: true },
    });
    const idOf = (u: string): string | undefined =>
      attorneys.find((a) => a.username === u)?.user_id;
    const c = await prisma.case.create({
      data: {
        client_id: amelia.id,
        title: ex.title,
        description:
          'Example case for the Active tab: it shows how a card looks in this state.',
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
    for (const s of ex.extraStates ?? []) {
      await prisma.state.upsert({
        where: { code: s },
        create: { code: s, name: s },
        update: {},
      });
      await prisma.caseState.create({
        data: { case_id: c.id, state_code: s, is_primary: false },
      });
    }
    const bidIds: string[] = [];
    for (const b of ex.bids) {
      const attorneyId = idOf(b.username);
      if (!attorneyId) continue;
      const bid = await prisma.bid.create({
        data: {
          case_id: c.id,
          attorney_id: attorneyId,
          status: 'active',
          fee_type: b.fee ?? 'fixed',
          amount_cents: b.cents,
          message: 'Example bid for the Active tab.',
          start_availability: 'immediately',
          turn: 'client',
        },
      });
      bidIds.push(bid.id);
    }
    // The case's bids counter is kept by the app, not by the database.
    await prisma.case.update({
      where: { id: c.id },
      data: { bids_count: bidIds.length },
    });
    if (ex.status !== 'open' && bidIds[0]) {
      await prisma.bid.update({
        where: { id: bidIds[0] },
        data: { status: 'accepted', decided_at: new Date() },
      });
      await prisma.case.update({
        where: { id: c.id },
        data: {
          status: ex.status,
          accepted_bid_id: bidIds[0],
          ...(ex.status === 'closed' ? { closed_at: new Date() } : {}),
        },
      });
    }
    created += 1;
  }
  return { created };
}
