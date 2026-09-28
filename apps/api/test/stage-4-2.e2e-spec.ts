import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * docs/04_CASES_BIDS.md §16 stage 4.2 acceptance, against real
 * CockroachDB/Redis:
 *  - a case is not created without verified contacts, without the
 *    client_contact_sharing consent, with more than 3 states, a short
 *    description, or contact info in free text;
 *  - practice/state changes are blocked once a case has bids;
 *  - deleting an in_progress case is blocked;
 *  - close/delete auto-reject active bids; restore/keep-alive reset the
 *    staleness timer; GET /users/me/cases paginates and filters by tab.
 */
jest.setTimeout(60_000);

describe('Stage 4.2 — case creation and management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let leafId = '';
  let categoryId = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);

    for (const code of ['NY', 'NJ', 'CT', 'PA']) {
      await prisma.state.upsert({
        where: { code },
        create: { code, name: code, is_active: true },
        update: { is_active: true },
      });
    }
    const category = await prisma.practiceArea.upsert({
      where: { code: 'e2e_s42_cat' },
      create: {
        code: 'e2e_s42_cat',
        name_en: 'E2E cat',
        i18n_key: 'practice.e2e_s42_cat',
        sort: 1,
      },
      update: {},
    });
    categoryId = category.id;
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_s42_leaf' },
      create: {
        code: 'e2e_s42_leaf',
        parent_id: category.id,
        name_en: 'E2E leaf',
        i18n_key: 'practice.e2e_s42_leaf',
        sort: 1,
      },
      update: {},
    });
    leafId = leaf.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function clientUser(
    opts: {
      phoneVerified?: boolean;
      emailVerified?: boolean;
      onboardingComplete?: boolean;
    } = {},
  ): Promise<{ id: string; auth: Record<string, string> }> {
    const now = new Date();
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Anna',
        last_name: 'Kowalski',
        phone_verified_at: opts.phoneVerified === false ? null : now,
        email_verified_at: opts.emailVerified === false ? null : now,
      },
    });
    if (opts.onboardingComplete !== false) {
      await prisma.onboardingState.create({
        data: { user_id: u.id, completed_at: now },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function attorneyUser(): Promise<{
    id: string;
    auth: Record<string, string>;
  }> {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const handle = `att${randomUUID().slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: 'verified',
      },
    });
    const token = tokens.signAccessToken({
      sub: u.id,
      role: 'attorney',
      sid: randomUUID(),
      verified: true,
      subscriptionStatus: 'active',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  function validCase(overrides: Record<string, unknown> = {}) {
    return {
      practiceAreaId: leafId,
      title: 'Need help with a landlord dispute',
      description:
        'My landlord kept my security deposit without a valid reason and I need advice on next steps.',
      primaryStateCode: 'NY',
      budgetMode: 'clarify_later',
      clientContactSharingConsent: true,
      ...overrides,
    };
  }

  function postCase(
    auth: Record<string, string>,
    body: Record<string, unknown>,
    key: string | null = randomUUID(),
  ) {
    const req = api().post('/api/v1/cases').set(auth);
    if (key !== null) req.set('Idempotency-Key', key);
    return req.send(body);
  }

  /** Directly gives a case an active bid (bids are stage 4.4's own write
   * path; a raw row is enough to exercise the bids_count / active-bid
   * gates this stage owns). */
  async function attachActiveBid(
    caseId: string,
    attorneyId: string,
  ): Promise<string> {
    const bid = await prisma.bid.create({
      data: {
        case_id: caseId,
        attorney_id: attorneyId,
        status: 'active',
        fee_type: 'fixed',
        amount_cents: 50_000,
        message: 'I can help with this case.',
        start_availability: 'immediately',
        turn: 'client',
      },
    });
    await prisma.bidOffer.create({
      data: {
        bid_id: bid.id,
        round_no: 0,
        from_role: 'attorney',
        fee_type: 'fixed',
        amount_cents: 50_000,
        status: 'pending',
      },
    });
    await prisma.case.update({
      where: { id: caseId },
      data: { bids_count: { increment: 1 } },
    });
    return bid.id;
  }

  it('rejects creation without verified contacts', async () => {
    const client = await clientUser({ emailVerified: false });
    const res = await postCase(client.auth, validCase());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CLIENT_CONTACTS_INCOMPLETE');
  });

  it('rejects creation without the client_contact_sharing consent, then accepts it once granted', async () => {
    const client = await clientUser();
    const noConsent = await postCase(
      client.auth,
      validCase({ clientContactSharingConsent: undefined }),
    );
    expect(noConsent.status).toBe(403);
    expect(noConsent.body.error.code).toBe(
      'CLIENT_CONTACT_SHARING_CONSENT_REQUIRED',
    );

    const withConsent = await postCase(client.auth, validCase());
    expect(withConsent.status).toBe(201);
    const consents = await prisma.userConsent.findMany({
      where: { user_id: client.id, consent_type: 'client_contact_sharing' },
    });
    expect(consents).toHaveLength(1);
    expect(consents[0].granted).toBe(true);

    // A second case doesn't need the flag again — already granted.
    const second = await postCase(
      client.auth,
      validCase({ clientContactSharingConsent: undefined }),
    );
    expect(second.status).toBe(201);
    expect(
      await prisma.userConsent.count({
        where: { user_id: client.id, consent_type: 'client_contact_sharing' },
      }),
    ).toBe(1);
  });

  it('rejects more than 3 states, a short description, and contact info in free text', async () => {
    const client = await clientUser();

    const tooManyStates = await postCase(
      client.auth,
      validCase({ additionalStateCodes: ['NJ', 'CT', 'PA'] }),
    );
    expect(tooManyStates.status).toBe(400);

    const dupState = await postCase(
      client.auth,
      validCase({ additionalStateCodes: ['NY'] }),
    );
    expect(dupState.status).toBe(400);
    expect(dupState.body.error.code).toBe('VALIDATION_ERROR');

    const shortDescription = await postCase(
      client.auth,
      validCase({ description: 'Too short.' }),
    );
    expect(shortDescription.status).toBe(400);

    const contactInDescription = await postCase(
      client.auth,
      validCase({ description: 'Call me at 555-123-4567 to discuss my case.' }),
    );
    expect(contactInDescription.status).toBe(400);
    expect(contactInDescription.body.error.code).toBe(
      'CASE_CONTAINS_CONTACT_INFO',
    );
    expect(contactInDescription.body.error.details).toEqual({
      field: 'description',
    });

    const unknownState = await postCase(
      client.auth,
      validCase({ primaryStateCode: 'ZZ' }),
    );
    expect(unknownState.status).toBe(400);

    const notALeaf = await postCase(
      client.auth,
      validCase({ practiceAreaId: categoryId }),
    );
    expect(notALeaf.status).toBe(400);
    expect(notALeaf.body.error.code).toBe('VALIDATION_ERROR');

    expect(await prisma.case.count({ where: { client_id: client.id } })).toBe(
      0,
    );
  });

  it('creates once: same Idempotency-Key replays, 3 states + journal + case_states persisted', async () => {
    const client = await clientUser();
    const key = randomUUID();
    const body = validCase({
      additionalStateCodes: ['NJ', 'CT'],
      budgetMode: 'amount',
      budgetAmountDollars: 600,
    });

    const first = await postCase(client.auth, body, key);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      title: body.title,
      primaryStateCode: 'NY',
      status: 'open',
      budgetMode: 'amount',
      budgetCents: 60_000,
      bidsCount: 0,
    });
    const states = first.body.data.states as {
      stateCode: string;
      isPrimary: boolean;
    }[];
    expect(
      [...states].sort((a, b) => a.stateCode.localeCompare(b.stateCode)),
    ).toEqual([
      { stateCode: 'CT', isPrimary: false },
      { stateCode: 'NJ', isPrimary: false },
      { stateCode: 'NY', isPrimary: true },
    ]);

    const replay = await postCase(client.auth, body, key);
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await prisma.case.count({ where: { client_id: client.id } })).toBe(
      1,
    );

    const caseStates = await prisma.caseState.findMany({
      where: { case_id: first.body.data.id as string },
    });
    expect(caseStates).toHaveLength(3);

    const journal = await prisma.caseJournal.findMany({
      where: { case_id: first.body.data.id as string },
    });
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({
      event_type: 'created',
      client_id: client.id,
      actor_user_id: client.id,
      actor_role: 'client',
    });
    expect(journal[0].prev_hash).toBeNull();

    const missingKey = await postCase(client.auth, body, null);
    expect(missingKey.status).toBe(400);
    expect(missingKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('edits an open case, blocks practice/state changes once bids exist, and notifies bidders', async () => {
    const client = await clientUser();
    const attorney = await attorneyUser();
    const created = await postCase(client.auth, validCase());
    const caseId = created.body.data.id as string;

    const edited = await api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(client.auth)
      .send({ title: 'Need help with a landlord dispute (updated)' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.title).toBe(
      'Need help with a landlord dispute (updated)',
    );

    const badContact = await api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(client.auth)
      .send({ description: 'Email me at foo@bar.com about this case please.' });
    expect(badContact.status).toBe(400);
    expect(badContact.body.error.code).toBe('CASE_CONTAINS_CONTACT_INFO');

    await attachActiveBid(caseId, attorney.id);

    const lockedPractice = await api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(client.auth)
      .send({ practiceAreaId: leafId });
    expect(lockedPractice.status).toBe(409);
    expect(lockedPractice.body.error.code).toBe('CASE_INVALID_STATE');

    const lockedStates = await api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(client.auth)
      .send({ additionalStateCodes: ['NJ'] });
    expect(lockedStates.status).toBe(409);

    // Non-locked fields still editable, and active bidders get notified.
    const stillEditable = await api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(client.auth)
      .send({ city: 'Brooklyn' });
    expect(stillEditable.status).toBe(200);
    expect(stillEditable.body.data.city).toBe('Brooklyn');

    const notes = await prisma.notification.findMany({
      where: { user_id: attorney.id, type: 'case_updated' },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].payload).toEqual({ caseId });

    const foreign = await clientUser();
    const notOwner = await api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(foreign.auth)
      .send({ city: 'Nowhere' });
    expect(notOwner.status).toBe(404);
  });

  it('closes a case: bid auto-rejected and notified; re-closing fails', async () => {
    const client = await clientUser();
    const attorney = await attorneyUser();
    const created = await postCase(client.auth, validCase());
    const caseId = created.body.data.id as string;
    const bidId = await attachActiveBid(caseId, attorney.id);

    const closed = await api()
      .post(`/api/v1/cases/${caseId}/close`)
      .set(client.auth)
      .send({});
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('closed');

    const bid = await prisma.bid.findUniqueOrThrow({ where: { id: bidId } });
    expect(bid.status).toBe('rejected_auto');

    const notes = await prisma.notification.findMany({
      where: { user_id: attorney.id, type: 'bid_rejected' },
    });
    expect(notes).toHaveLength(1);

    const again = await api()
      .post(`/api/v1/cases/${caseId}/close`)
      .set(client.auth)
      .send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CASE_INVALID_STATE');
  });

  it('deletes open/archived cases but never in_progress ones', async () => {
    const client = await clientUser();
    const created = await postCase(client.auth, validCase());
    const caseId = created.body.data.id as string;

    const inProgress = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'In progress case for delete guard',
        description: 'A'.repeat(40),
        practice_area_id: leafId,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
        status: 'in_progress',
      },
    });

    const blocked = await api()
      .delete(`/api/v1/cases/${inProgress.id}`)
      .set(client.auth);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CASE_INVALID_STATE');

    const deleted = await api()
      .delete(`/api/v1/cases/${caseId}`)
      .set(client.auth);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toEqual({ deleted: true });

    const row = await prisma.case.findFirst({
      where: { id: caseId },
    });
    expect(row).toBeNull(); // soft-delete: hidden from the default reader.
    const withDeleted = await prisma.$queryRaw<{ deleted_at: Date | null }[]>`
      SELECT deleted_at FROM cases WHERE id = ${caseId}::UUID`;
    expect(withDeleted[0]?.deleted_at).not.toBeNull();
  });

  it('restores an archived case and resets the staleness timer', async () => {
    const client = await clientUser();
    const created = await postCase(client.auth, validCase());
    const caseId = created.body.data.id as string;
    await prisma.case.update({
      where: { id: caseId },
      data: {
        status: 'archived',
        archived_at: new Date(),
        stale_prompt_sent_at: new Date(),
      },
    });

    const notArchivedYet = await api()
      .post(`/api/v1/cases/${caseId}/restore`)
      .set(client.auth)
      .send({});
    expect(notArchivedYet.status).toBe(200);
    expect(notArchivedYet.body.data.status).toBe('open');
    expect(notArchivedYet.body.data.archivedAt).toBeNull();

    const notArchived = await api()
      .post(`/api/v1/cases/${caseId}/restore`)
      .set(client.auth)
      .send({});
    expect(notArchived.status).toBe(409);
  });

  it('keep-alive bumps last_activity_at and clears the stale prompt', async () => {
    const client = await clientUser();
    const created = await postCase(client.auth, validCase());
    const caseId = created.body.data.id as string;
    await prisma.case.update({
      where: { id: caseId },
      data: {
        stale_prompt_sent_at: new Date(),
        last_activity_at: new Date(Date.now() - 60_000),
      },
    });

    const res = await api()
      .post(`/api/v1/cases/${caseId}/keep-alive`)
      .set(client.auth)
      .send({});
    expect(res.status).toBe(200);
    const row = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(row.stale_prompt_sent_at).toBeNull();

    await prisma.case.update({
      where: { id: caseId },
      data: { status: 'closed', closed_at: new Date() },
    });
    const onClosed = await api()
      .post(`/api/v1/cases/${caseId}/keep-alive`)
      .set(client.auth)
      .send({});
    expect(onClosed.status).toBe(409);
  });

  it('GET /users/me/cases filters by tab, paginates, excludes deleted and other clients', async () => {
    const client = await clientUser();
    const other = await clientUser();
    await postCase(other.auth, validCase());

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await postCase(
        client.auth,
        validCase({ title: `Open case number ${i} for listing` }),
      );
      ids.push(res.body.data.id as string);
    }
    const archived = await postCase(
      client.auth,
      validCase({ title: 'Archived case for listing test' }),
    );
    await prisma.case.update({
      where: { id: archived.body.data.id as string },
      data: { status: 'archived', archived_at: new Date() },
    });
    const toDelete = await postCase(
      client.auth,
      validCase({ title: 'Deleted case should not be listed' }),
    );
    await api()
      .delete(`/api/v1/cases/${toDelete.body.data.id as string}`)
      .set(client.auth);

    const page1 = await api()
      .get('/api/v1/users/me/cases')
      .query({ filter: 'active', limit: 2 })
      .set(client.auth);
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.data[0].id).toBe(ids[2]);
    expect(page1.body.meta.nextCursor).toEqual(expect.any(String));

    const page2 = await api()
      .get('/api/v1/users/me/cases')
      .query({ filter: 'active', cursor: page1.body.meta.nextCursor as string })
      .set(client.auth);
    expect(page2.status).toBe(200);
    const page2Items = page2.body.data as { id: string }[];
    expect(page2Items.map((c) => c.id)).toEqual([ids[0]]);
    expect(page2.body.meta.nextCursor).toBeNull();

    const archivedTab = await api()
      .get('/api/v1/users/me/cases')
      .query({ filter: 'archived' })
      .set(client.auth);
    expect(archivedTab.body.data).toHaveLength(1);
    expect(archivedTab.body.data[0].id).toBe(archived.body.data.id);

    const closedTab = await api()
      .get('/api/v1/users/me/cases')
      .query({ filter: 'closed' })
      .set(client.auth);
    expect(closedTab.body.data).toHaveLength(0);
  });
});
