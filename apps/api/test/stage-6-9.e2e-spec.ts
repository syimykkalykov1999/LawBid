import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CaseJournalService } from '../src/modules/journal/case-journal.service';
import { AccountAnonymizationService } from '../src/modules/privacy/account-anonymization.service';
import { DataExportService } from '../src/modules/privacy/data-export.service';
import { ExportsCleanupService } from '../src/modules/privacy/exports-cleanup.service';
import { JournalIntegrityService } from '../src/modules/privacy/journal-integrity.service';
import { JournalRetentionService } from '../src/modules/privacy/journal-retention.service';

/**
 * docs/06 §5 / §13 stage 6.9 acceptance, against real CockroachDB / Redis /
 * MinIO:
 *  - after anonymization the DB holds no name/email/phone/document files
 *    of the user, the journal stays;
 *  - journal rows before `retain_until` cannot be removed by the retention
 *    job, rows past it are;
 *  - a tampered journal row is found by the chain check;
 *  - the data export is a ZIP behind a link that expires.
 */
jest.setTimeout(120_000);

describe('stage 6.9 — privacy and data lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let journal: CaseJournalService;
  let baseUrl = '';
  let practiceAreaId = '';
  const api = () => request(baseUrl);
  const DAY = 86_400_000;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
    await app.listen(0);
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    journal = app.get(CaseJournalService);
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    practiceAreaId = (
      await prisma.practiceArea.upsert({
        where: { code: 'e2e_privacy_leaf' },
        create: {
          code: 'e2e_privacy_leaf',
          name_en: 'E2E privacy',
          i18n_key: 'practice.e2e_privacy_leaf',
          sort: 1,
        },
        update: {},
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function user(role: 'client' | 'attorney') {
    const tag = randomUUID().slice(0, 8);
    const u = await prisma.user.create({
      data: {
        role,
        first_name: role === 'client' ? 'Dana' : 'Saul',
        last_name: 'Person',
        email: `${role}_${tag}@lawbid-e2e.test`,
        email_verified_at: new Date(),
        phone_e164: `+1201555${tag.replace(/\D/g, '').padEnd(4, '7').slice(0, 4)}${Math.floor(Math.random() * 900 + 100)}`,
        ...(role === 'attorney'
          ? {
              attorney_profile: {
                create: {
                  username: `att_${tag}`,
                  username_lower: `att_${tag}`,
                  bio: 'Trial lawyer',
                  firm_name: 'Goodman LLC',
                  languages: ['en'],
                  verification_status: 'verified',
                },
              },
              subscription: {
                create: { status: 'active', price_cents: 39900 },
              },
            }
          : {}),
      },
    });
    const sid = randomUUID();
    return {
      id: u.id,
      sid,
      auth: {
        Authorization: `Bearer ${tokens.signAccessToken({
          sub: u.id,
          role,
          sid,
          verified: role === 'attorney',
          subscriptionStatus: 'none',
        })}`,
      },
    };
  }

  const reauthFor = (u: { id: string; sid: string }) => ({
    'X-Reauth-Token': tokens.signReauthToken({ sub: u.id, sid: u.sid }),
  });

  async function kase(
    clientId: string,
    status: 'open' | 'in_progress' = 'open',
  ) {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Privacy case',
        description: 'A case used by the stage 6.9 acceptance tests.',
        practice_area_id: practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status,
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    await prisma.$transaction((tx) =>
      journal.append(tx, {
        caseId: c.id,
        clientId,
        actor: { userId: clientId, role: 'client' },
        event: 'created',
        payload: {},
      }),
    );
    return c.id;
  }

  async function acceptedBid(caseId: string, attorneyId: string) {
    const bid = await prisma.bid.create({
      data: {
        case_id: caseId,
        attorney_id: attorneyId,
        fee_type: 'fixed',
        amount_cents: 50_000,
        message: 'Hi',
        start_availability: 'immediately',
        turn: 'client',
        status: 'accepted',
      },
    });
    await prisma.case.update({
      where: { id: caseId },
      data: { status: 'in_progress', accepted_bid_id: bid.id },
    });
    return bid;
  }

  describe('§5.1 anonymization after the grace period', () => {
    it('scrubs the attorney, keeps the journal, closes the case in work', async () => {
      const client = await user('client');
      const attorney = await user('attorney');
      const caseId = await kase(client.id);
      const bid = await acceptedBid(caseId, attorney.id);
      const conv = await prisma.conversation.create({
        data: {
          case_id: caseId,
          bid_id: bid.id,
          attorney_id: attorney.id,
          client_id: client.id,
          status: 'active',
        },
      });
      const message = await prisma.message.create({
        data: {
          conversation_id: conv.id,
          sender_id: attorney.id,
          type: 'text',
          body_original: 'Call me at 201-555-0100',
          body_display: 'Call me at ***',
          contact_masked: true,
          client_message_id: randomUUID(),
        },
      });
      const post = await prisma.post.create({
        data: {
          author_id: attorney.id,
          body: 'Hello feed',
          status: 'published',
        },
      });
      await prisma.userIdentifier.create({
        data: {
          user_id: attorney.id,
          provider: 'google',
          provider_uid: `g-${randomUUID()}`,
          verified_at: new Date(),
        },
      });
      const session = await prisma.session.create({
        data: {
          user_id: attorney.id,
          session_chain_id: randomUUID(),
          refresh_hash: randomUUID(),
          expires_at: new Date(Date.now() + DAY),
        },
      });
      const avatar = await prisma.file.create({
        data: {
          owner_user_id: attorney.id,
          purpose: 'avatar',
          s3_bucket: 'lawbid-media',
          s3_key: `avatars/${attorney.id}/${randomUUID()}.jpg`,
          mime: 'image/jpeg',
          size_bytes: 10n,
          sha256: 'a'.repeat(64),
          scan_status: 'clean',
        },
      });
      const doc = await prisma.file.create({
        data: {
          owner_user_id: attorney.id,
          purpose: 'verification_document',
          s3_bucket: 'lawbid-documents',
          s3_key: `verification/${attorney.id}/${randomUUID()}.pdf`,
          mime: 'application/pdf',
          size_bytes: 10n,
          sha256: 'b'.repeat(64),
          scan_status: 'clean',
        },
      });
      const journalBefore = await prisma.caseJournal.count({
        where: { case_id: caseId },
      });

      // Requested 15 days ago → due.
      await prisma.user.update({
        where: { id: attorney.id },
        data: {
          status: 'deletion_pending',
          deletion_requested_at: new Date(Date.now() - 15 * DAY),
          avatar_file_id: avatar.id,
        },
      });
      // A client still inside the grace period is left alone.
      const fresh = await user('client');
      await prisma.user.update({
        where: { id: fresh.id },
        data: {
          status: 'deletion_pending',
          deletion_requested_at: new Date(Date.now() - 3 * DAY),
        },
      });

      const result = await app.get(AccountAnonymizationService).anonymizeDue();
      expect(result.anonymized).toContain(attorney.id);
      expect(result.anonymized).not.toContain(fresh.id);
      expect(result.failed).toEqual([]);

      const u = await prisma.user.findUniqueOrThrow({
        where: { id: attorney.id },
        include: { attorney_profile: true },
      });
      expect(u.status).toBe('deleted');
      expect(u.anonymized_at).not.toBeNull();
      expect(u.first_name).toBe('Deleted');
      expect(u.last_name).toBe('User');
      expect(u.email).toBeNull();
      expect(u.phone_e164).toBeNull();
      expect(u.avatar_file_id).toBeNull();
      expect(u.attorney_profile?.username).toMatch(/^deleted_[0-9a-f]{8}$/);
      expect(u.attorney_profile?.bio).toBeNull();
      expect(u.attorney_profile?.firm_name).toBeNull();
      expect(
        await prisma.userIdentifier.count({ where: { user_id: attorney.id } }),
      ).toBe(0);
      expect(
        (await prisma.session.findUniqueOrThrow({ where: { id: session.id } }))
          .revoked_at,
      ).not.toBeNull();
      for (const f of [avatar, doc]) {
        // Soft-deleted rows are hidden from plain model reads.
        const [row] = await prisma.$queryRaw<{ deleted_at: Date | null }[]>`
          SELECT deleted_at FROM files WHERE id = ${f.id}::UUID`;
        expect(row.deleted_at).not.toBeNull();
      }
      const [p] = await prisma.$queryRaw<{ status: string }[]>`
        SELECT status::STRING AS status FROM posts WHERE id = ${post.id}::UUID`;
      expect(p.status).toBe('removed');
      const m = await prisma.message.findUniqueOrThrow({
        where: { id: message.id },
      });
      expect(m.body_original).toBe('[deleted]');
      expect(m.body_display).toBe('[deleted]');

      // The case in work is closed with a journal event; the client hears.
      const c = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
      expect(c.status).toBe('closed');
      const events = await prisma.caseJournal.findMany({
        where: { case_id: caseId },
        orderBy: { created_at: 'asc' },
      });
      expect(events.length).toBe(journalBefore + 1);
      expect(events.at(-1)?.event_type).toBe('closed');
      expect(events.at(-1)?.payload).toEqual({ reason: 'account_deleted' });
      expect(
        await prisma.notification.count({
          where: { user_id: client.id, type: 'case_closed' },
        }),
      ).toBe(1);
      expect((await journal.verifyChain(caseId)).valid).toBe(true);

      // Idempotent.
      expect(
        await app.get(AccountAnonymizationService).anonymize(attorney.id),
      ).toBe(false);
    });

    it('client: open cases are archived, bids auto-rejected', async () => {
      const client = await user('client');
      const attorney = await user('attorney');
      const caseId = await kase(client.id);
      const bid = await prisma.bid.create({
        data: {
          case_id: caseId,
          attorney_id: attorney.id,
          fee_type: 'fixed',
          amount_cents: 50_000,
          message: 'Hi',
          start_availability: 'immediately',
          turn: 'client',
        },
      });
      await prisma.user.update({
        where: { id: client.id },
        data: {
          status: 'deletion_pending',
          deletion_requested_at: new Date(Date.now() - 20 * DAY),
        },
      });
      await app.get(AccountAnonymizationService).anonymizeDue();
      expect(
        (await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status,
      ).toBe('archived');
      expect(
        (await prisma.bid.findUniqueOrThrow({ where: { id: bid.id } })).status,
      ).toBe('rejected_auto');
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: client.id },
      });
      expect(u.status).toBe('deleted');
      expect(u.email).toBeNull();
    });
  });

  describe('§5.2 data export', () => {
    it('reauth → queued → ZIP behind a 24-hour link → expires', async () => {
      const client = await user('client');
      await kase(client.id);

      const denied = await api()
        .post('/api/v1/users/me/data-export')
        .set(client.auth)
        .send();
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('REAUTH_REQUIRED');

      const started = await api()
        .post('/api/v1/users/me/data-export')
        .set(client.auth)
        .set(reauthFor(client))
        .send();
      expect(started.status).toBe(202);
      expect(started.body.data.status).toBe('queued');
      const exportId = started.body.data.exportId as string;

      // A second request while one is in flight returns the same job.
      const again = await api()
        .post('/api/v1/users/me/data-export')
        .set(client.auth)
        .set(reauthFor(client))
        .send();
      expect(again.body.data.exportId).toBe(exportId);

      // The in-process worker may already have claimed the job; the manual
      // call is then a no-op (atomic claim) — poll until ready either way.
      await app.get(DataExportService).process(exportId);
      const statusOf = () =>
        api().get(`/api/v1/users/me/data-export/${exportId}`).set(client.auth);
      let ready = await statusOf();
      for (let i = 0; i < 40 && ready.body.data.status !== 'ready'; i++) {
        await new Promise((r) => setTimeout(r, 250));
        ready = await statusOf();
      }
      expect(ready.status).toBe(200);
      expect(ready.body.data.status).toBe('ready');
      const url = ready.body.data.url as string;
      const zip = await fetch(url);
      expect(zip.status).toBe(200);
      expect(
        Buffer.from(await zip.arrayBuffer())
          .subarray(0, 2)
          .toString(),
      ).toBe('PK');
      expect(
        await prisma.notification.count({
          where: { user_id: client.id, type: 'data_export_ready' },
        }),
      ).toBe(1);
      const row = await prisma.dataExportJob.findUniqueOrThrow({
        where: { id: exportId },
        include: { file: true },
      });
      expect(row.file?.purpose).toBe('data_export');

      // Not visible to anyone else.
      const other = await user('client');
      expect(
        (
          await api()
            .get(`/api/v1/users/me/data-export/${exportId}`)
            .set(other.auth)
        ).status,
      ).toBe(404);

      // Past expires_at the cleanup drops the object and the link.
      await prisma.dataExportJob.update({
        where: { id: exportId },
        data: { expires_at: new Date(Date.now() - 1000) },
      });
      const cleaned = await app.get(ExportsCleanupService).run();
      expect(cleaned.expired).toBeGreaterThanOrEqual(1);
      const expired = await api()
        .get(`/api/v1/users/me/data-export/${exportId}`)
        .set(client.auth);
      expect(expired.body.data.status).toBe('expired');
      expect(expired.body.data.url).toBeNull();
      const [gone] = await prisma.$queryRaw<{ deleted_at: Date | null }[]>`
        SELECT deleted_at FROM files WHERE id = ${row.file_id!}::UUID`;
      expect(gone.deleted_at).not.toBeNull();
      expect((await fetch(url)).status).toBe(404);
    });
  });

  describe('§5.3 journal retention and integrity', () => {
    it('retention removes only rows past retain_until', async () => {
      const client = await user('client');
      const oldCase = await kase(client.id);
      const liveCase = await kase(client.id);
      await prisma.$executeRaw`
        UPDATE case_journal SET retain_until = now() - INTERVAL '1 day'
        WHERE case_id = ${oldCase}::UUID`;
      const before = await prisma.caseJournal.count({
        where: { case_id: liveCase },
      });

      const { deleted } = await app.get(JournalRetentionService).run();
      expect(deleted).toBeGreaterThanOrEqual(1);
      expect(
        await prisma.caseJournal.count({ where: { case_id: oldCase } }),
      ).toBe(0);
      expect(
        await prisma.caseJournal.count({ where: { case_id: liveCase } }),
      ).toBe(before);
    });

    it('the daily chain check finds a tampered row', async () => {
      const client = await user('client');
      const caseId = await kase(client.id);
      await prisma.$transaction((tx) =>
        journal.append(tx, {
          caseId,
          clientId: client.id,
          actor: { userId: client.id, role: 'client' },
          event: 'updated',
          payload: { title: 'v2' },
        }),
      );
      const clean = await app.get(JournalIntegrityService).run();
      expect(clean.broken.find((b) => b.caseId === caseId)).toBeUndefined();

      await prisma.$executeRaw`
        UPDATE case_journal SET payload = '{"title":"forged"}'::JSONB
        WHERE case_id = ${caseId}::UUID AND event_type = 'updated'`;
      const result = await app.get(JournalIntegrityService).run();
      const hit = result.broken.find((b) => b.caseId === caseId);
      expect(hit?.brokenAt?.reason).toBe('hash_mismatch');
    });
  });
});
