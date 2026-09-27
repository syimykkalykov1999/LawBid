import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { validateCaseStates } from '../src/modules/cases/domain/case-states.rule';

/**
 * docs/02_DATABASE.md §8, stage 2.4 acceptance (real CockroachDB):
 * one bid per attorney per case; round_count > 5 rejected; a case can't
 * be created with > 3 states or without a primary; a case_journal row is
 * written in the same transaction as the case change. The lawbid_app
 * UPDATE/DELETE check needs the DB roles from stage 2.6 and lives in
 * test/db-roles-indexes.e2e-spec.ts.
 */
describe('DB schema — stage 2.4 acceptance', () => {
  const prisma = new PrismaClient();
  let leafId: string;

  beforeAll(async () => {
    for (const [code, name] of [
      ['NY', 'New York'],
      ['NJ', 'New Jersey'],
      ['CT', 'Connecticut'],
      ['PA', 'Pennsylvania'],
    ]) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name },
        update: {},
      });
    }
    const cat = await prisma.practiceArea.upsert({
      where: { code: 'traffic_tickets' },
      create: {
        code: 'traffic_tickets',
        name_en: 'Traffic Tickets',
        i18n_key: 'practice.traffic_tickets',
        sort: 0,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'traffic_tickets.speeding' },
      create: {
        code: 'traffic_tickets.speeding',
        parent_id: cat.id,
        name_en: 'Speeding',
        i18n_key: 'practice.traffic_tickets.speeding',
        sort: 0,
      },
      update: {},
    });
    leafId = leaf.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Mirrors what the file-04 case service will do: validate states, then
  // insert case + states + journal row in one transaction.
  async function createCase(
    clientId: string,
    states: { stateCode: string; isPrimary: boolean }[],
    failAfterJournal = false,
  ) {
    const primary = validateCaseStates(states);
    return prisma.$transaction(async (tx) => {
      const c = await tx.case.create({
        data: {
          client_id: clientId,
          title: 'Speeding ticket in Queens',
          description: 'Got a ticket, need representation.',
          practice_area_id: leafId,
          primary_state_code: primary,
          budget_mode: 'clarify_later',
        },
      });
      await tx.caseState.createMany({
        data: states.map((s) => ({
          case_id: c.id,
          state_code: s.stateCode,
          is_primary: s.isPrimary,
        })),
      });
      await tx.caseJournal.create({
        data: {
          case_id: c.id,
          client_id: clientId,
          actor_user_id: clientId,
          actor_role: 'client',
          event_type: 'created',
          payload: { title: c.title },
          row_hash: randomUUID(),
        },
      });
      if (failAfterJournal) throw new Error('simulated failure');
      return c;
    });
  }

  const newUser = (role: 'client' | 'attorney') =>
    prisma.user.create({ data: { role } });

  it('allows one bid per attorney per case', async () => {
    const client = await newUser('client');
    const attorney = await newUser('attorney');
    const c = await createCase(client.id, [
      { stateCode: 'NY', isPrimary: true },
    ]);
    const bid = {
      case_id: c.id,
      attorney_id: attorney.id,
      fee_type: 'fixed' as const,
      amount_cents: 50000,
      message: 'I can help.',
      start_availability: 'immediately' as const,
      turn: 'client' as const,
    };
    await prisma.bid.create({ data: bid });
    await expect(prisma.bid.create({ data: bid })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rejects round_count > 5 (and accepts 5)', async () => {
    const client = await newUser('client');
    const attorney = await newUser('attorney');
    const c = await createCase(client.id, [
      { stateCode: 'NY', isPrimary: true },
    ]);
    const b = await prisma.bid.create({
      data: {
        case_id: c.id,
        attorney_id: attorney.id,
        fee_type: 'hourly',
        amount_cents: 25000,
        message: 'Hourly.',
        start_availability: 'within_week',
        turn: 'client',
      },
    });
    await prisma.bid.update({ where: { id: b.id }, data: { round_count: 5 } });
    await expect(
      prisma.bid.update({ where: { id: b.id }, data: { round_count: 6 } }),
    ).rejects.toThrow(/23514/);
  });

  it('rejects > 3 states, no primary, and two primaries', async () => {
    const client = await newUser('client');
    expect(() =>
      validateCaseStates([
        { stateCode: 'NY', isPrimary: true },
        { stateCode: 'NJ', isPrimary: false },
        { stateCode: 'CT', isPrimary: false },
        { stateCode: 'PA', isPrimary: false },
      ]),
    ).toThrow();
    await expect(
      createCase(client.id, [{ stateCode: 'NY', isPrimary: false }]),
    ).rejects.toThrow();

    // DB backstop: a second primary row is rejected by the partial UQ.
    const c = await createCase(client.id, [
      { stateCode: 'NY', isPrimary: true },
      { stateCode: 'NJ', isPrimary: false },
    ]);
    await expect(
      prisma.caseState.create({
        data: { case_id: c.id, state_code: 'CT', is_primary: true },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('writes the journal row in the same transaction as the case', async () => {
    const client = await newUser('client');
    const c = await createCase(client.id, [
      { stateCode: 'NY', isPrimary: true },
    ]);
    const journal = await prisma.caseJournal.findMany({
      where: { case_id: c.id },
    });
    expect(journal).toHaveLength(1);
    // retain_until defaults to ~5 years out (§6.4).
    const years =
      (journal[0].retain_until.getTime() - journal[0].created_at.getTime()) /
      (365.25 * 24 * 3600 * 1000);
    expect(years).toBeGreaterThan(4.99);

    const before = await prisma.case.count({ where: { client_id: client.id } });
    await expect(
      createCase(client.id, [{ stateCode: 'NY', isPrimary: true }], true),
    ).rejects.toThrow('simulated failure');
    expect(await prisma.case.count({ where: { client_id: client.id } })).toBe(
      before,
    );
    expect(
      await prisma.caseJournal.count({ where: { client_id: client.id } }),
    ).toBe(1);
  });

  it('enforces budget_mode <-> budget_cents and review rating 1..5', async () => {
    const client = await newUser('client');
    await expect(
      prisma.case.create({
        data: {
          client_id: client.id,
          title: 't',
          description: 'd',
          practice_area_id: leafId,
          primary_state_code: 'NY',
          budget_mode: 'amount',
        },
      }),
    ).rejects.toThrow(/23514/);
    const attorney = await newUser('attorney');
    const c = await createCase(client.id, [
      { stateCode: 'NY', isPrimary: true },
    ]);
    await expect(
      prisma.review.create({
        data: {
          case_id: c.id,
          client_id: client.id,
          attorney_id: attorney.id,
          rating: 6,
        },
      }),
    ).rejects.toThrow(/23514/);
  });
});
