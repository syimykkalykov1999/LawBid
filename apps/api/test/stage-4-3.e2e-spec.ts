import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { e2eRedisUrl } from './support/e2e-env';
import { PrismaService } from '../src/prisma/prisma.service';
import { CaseAccessPolicy } from '../src/modules/cases/policies/case-access.policy';
import { CasesFeedService } from '../src/modules/cases/services/cases-feed.service';
import { CaseViewTrackingService } from '../src/modules/cases/services/case-view-tracking.service';
import {
  buildVisibleCasesSql,
  GENERAL_PRACTICE_CODE,
  NOT_SURE_OR_OTHER_CODE,
} from '../src/modules/cases/queries/cases-visible.sql';

/**
 * docs/04_CASES_BIDS.md §16 stage 4.3 acceptance against CockroachDB:
 * - §4.1 visibility (license + practice, incl. the not_sure_or_other
 *   exception) through CasesFeedService.listFeed, using the exact SQL
 *   shape from cases-visible.sql.ts (must match test/db-roles-indexes
 *   .e2e-spec.ts's canonical `visibleQuery`);
 * - cursor pagination and the §4.2 practice/state filters;
 * - an attorney hitting an ineligible case's id directly gets
 *   CASE_NOT_AVAILABLE, never CASE_NOT_FOUND (CaseAccessPolicy from stage
 *   4.1, used as-is);
 * - the attorney case detail never carries a client field;
 * - view-count dedup + batched flush (CaseViewTrackingService);
 * - EXPLAIN of the feed query never full-scans cases/case_states.
 */
describe('Stage 4.3 — attorney case feed, detail, views, save (e2e)', () => {
  jest.setTimeout(60_000);
  const root = new PrismaClient();
  const prisma = new PrismaService();
  const redis = new Redis(e2eRedisUrl());
  const logger = {
    setContext: () => undefined,
    error: () => undefined,
    info: () => undefined,
  };

  const access = new CaseAccessPolicy(prisma);
  const viewTracking = new CaseViewTrackingService(
    prisma,
    redis,
    logger as never,
  );
  const feed = new CasesFeedService(prisma, access, viewTracking);

  const leaf: Record<string, string> = {};
  let clientId: string;

  async function upsertLeaf(code: string): Promise<string> {
    const cat = code.split('.')[0];
    const parent = await root.practiceArea.upsert({
      where: { code: cat },
      create: { code: cat, name_en: cat, i18n_key: `practice.${cat}`, sort: 0 },
      update: {},
    });
    const row = await root.practiceArea.upsert({
      where: { code },
      create: {
        code,
        parent_id: parent.id,
        name_en: code,
        i18n_key: `practice.${code}`,
        sort: 0,
      },
      update: {},
    });
    return row.id;
  }

  async function newAttorney(opts: {
    verified?: boolean;
    licenses?: [string, 'verified' | 'pending'][];
    areas?: string[];
  }): Promise<string> {
    const u = await root.user.create({ data: { role: 'attorney' } });
    const handle = `att${randomUUID().slice(0, 8)}`;
    await root.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: opts.verified === false ? 'pending' : 'verified',
      },
    });
    for (const [state, status] of opts.licenses ?? [['NJ', 'verified']]) {
      await root.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: state,
          bar_number: `${state}-${randomUUID()}`,
          license_status: status,
        },
      });
    }
    for (const area of opts.areas ?? ['traffic_tickets.speeding']) {
      await root.attorneyPracticeArea.create({
        data: { attorney_id: u.id, practice_area_id: leaf[area] },
      });
    }
    return u.id;
  }

  async function newCase(opts: {
    title?: string;
    area?: string;
    states?: string[];
    status?: 'open' | 'closed';
    createdAt?: Date;
  }): Promise<string> {
    const states = opts.states ?? ['NJ'];
    const c = await root.case.create({
      data: {
        client_id: clientId,
        title: opts.title ?? 'Speeding ticket',
        description: 'Got a ticket on the turnpike, need help.',
        practice_area_id: leaf[opts.area ?? 'traffic_tickets.speeding'],
        primary_state_code: states[0],
        budget_mode: 'clarify_later',
        status: opts.status ?? 'open',
        ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
      },
    });
    await root.caseState.createMany({
      data: states.map((s, i) => ({
        case_id: c.id,
        state_code: s,
        is_primary: i === 0,
      })),
    });
    return c.id;
  }

  beforeAll(async () => {
    for (const [code, name] of [
      ['NJ', 'New Jersey'],
      ['NY', 'New York'],
      ['CA', 'California'],
      ['TX', 'Texas'],
      ['FL', 'Florida'],
      ['IL', 'Illinois'],
      ['PA', 'Pennsylvania'],
      ['OH', 'Ohio'],
      ['GA', 'Georgia'],
      ['NC', 'North Carolina'],
      ['MI', 'Michigan'],
    ]) {
      await root.state.upsert({
        where: { code },
        create: { code, name },
        update: {},
      });
    }
    for (const code of [
      'traffic_tickets.speeding',
      'dui_and_dwi.first_offense_dui',
      GENERAL_PRACTICE_CODE,
      NOT_SURE_OR_OTHER_CODE,
    ]) {
      leaf[code] = await upsertLeaf(code);
    }
    clientId = (await root.user.create({ data: { role: 'client' } })).id;
  });

  afterAll(async () => {
    await Promise.all([root.$disconnect(), prisma.$disconnect(), redis.quit()]);
  });

  describe('§4.1 visibility via CasesFeedService.listFeed', () => {
    it('matches on primary and secondary states, excludes wrong state/practice/pending-license/closed', async () => {
      const attorneyId = await newAttorney({});
      const visiblePrimary = await newCase({
        title: 'NJ speeding',
        states: ['NJ'],
      });
      const visibleSecondary = await newCase({
        title: 'NY+NJ speeding',
        states: ['NY', 'NJ'],
      });
      const wrongState = await newCase({
        title: 'NY only speeding',
        states: ['NY'],
      });
      const noLicenseState = await newCase({
        title: 'CA speeding',
        states: ['CA'],
      });
      const wrongPractice = await newCase({
        title: 'NJ DUI',
        area: 'dui_and_dwi.first_offense_dui',
        states: ['NJ'],
      });
      const closed = await newCase({
        title: 'NJ closed',
        states: ['NJ'],
        status: 'closed',
      });

      const page = await feed.listFeed(
        { userId: attorneyId, role: 'attorney' },
        {},
      );
      const ids = page.items.map((i) => i.id);
      expect(ids).toEqual(
        expect.arrayContaining([visiblePrimary, visibleSecondary]),
      );
      for (const hidden of [
        wrongState,
        noLicenseState,
        wrongPractice,
        closed,
      ]) {
        expect(ids).not.toContain(hidden);
      }
    });

    it('not_sure_or_other exception: visible to General Practice, not to an unrelated specialization', async () => {
      const generalAttorney = await newAttorney({
        areas: [GENERAL_PRACTICE_CODE],
      });
      const speedingAttorney = await newAttorney({});
      const notSureCase = await newCase({
        title: 'Not sure what kind of case',
        area: NOT_SURE_OR_OTHER_CODE,
        states: ['NJ'],
      });

      const generalPage = await feed.listFeed(
        { userId: generalAttorney, role: 'attorney' },
        {},
      );
      expect(generalPage.items.map((i) => i.id)).toContain(notSureCase);

      const speedingPage = await feed.listFeed(
        { userId: speedingAttorney, role: 'attorney' },
        {},
      );
      expect(speedingPage.items.map((i) => i.id)).not.toContain(notSureCase);
    });

    it('an unverified attorney profile gets an empty page', async () => {
      const attorneyId = await newAttorney({ verified: false });
      const page = await feed.listFeed(
        { userId: attorneyId, role: 'attorney' },
        {},
      );
      expect(page).toEqual({ items: [], nextCursor: null });
    });

    it('cursor pagination walks the whole set newest-first without gaps or repeats', async () => {
      // A dedicated practice leaf isolates this attorney's feed from every
      // other test's fixtures (all tests share one un-truncated database).
      const area = `traffic_tickets.pagetest_${randomUUID().slice(0, 8)}`;
      leaf[area] = await upsertLeaf(area);
      const attorneyId = await newAttorney({ areas: [area] });
      const base = Date.now();
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const id = await newCase({
          title: `Paged case ${i}`,
          area,
          createdAt: new Date(base - i * 1000),
        });
        ids.push(id);
      }
      const seen: string[] = [];
      let cursor: string | null | undefined;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await feed.listFeed(
          { userId: attorneyId, role: 'attorney' },
          { limit: 2, cursor: cursor ?? undefined },
        );
        seen.push(...page.items.map((i) => i.id));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      expect(seen.slice(0, 5)).toEqual(ids);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('practiceAreaId and state filters narrow the result', async () => {
      const attorneyId = await newAttorney({
        licenses: [
          ['NJ', 'verified'],
          ['NY', 'verified'],
        ],
      });
      const nj = await newCase({ title: 'Filter NJ', states: ['NJ'] });
      const ny = await newCase({ title: 'Filter NY', states: ['NY'] });

      const njOnly = await feed.listFeed(
        { userId: attorneyId, role: 'attorney' },
        { state: 'NJ' },
      );
      expect(njOnly.items.map((i) => i.id)).toContain(nj);
      expect(njOnly.items.map((i) => i.id)).not.toContain(ny);

      const wrongPracticeFilter = await feed.listFeed(
        { userId: attorneyId, role: 'attorney' },
        { practiceAreaId: leaf['dui_and_dwi.first_offense_dui'] },
      );
      expect(wrongPracticeFilter.items.map((i) => i.id)).not.toContain(nj);
    });
  });

  describe('§4.3 case detail: CASE_NOT_AVAILABLE, no client field', () => {
    it('an attorney unlicensed in the state gets CASE_NOT_AVAILABLE by direct id, not CASE_NOT_FOUND', async () => {
      const attorneyId = await newAttorney({ licenses: [['NY', 'verified']] });
      const caseId = await newCase({ states: ['NJ'] });
      await expect(
        feed.getDetailForAttorney(attorneyId, caseId),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: 'CASE_NOT_AVAILABLE' },
      });
    });

    it('a non-existent case id also gets CASE_NOT_AVAILABLE for an attorney', async () => {
      const attorneyId = await newAttorney({});
      await expect(
        feed.getDetailForAttorney(attorneyId, randomUUID()),
      ).rejects.toMatchObject({ response: { code: 'CASE_NOT_AVAILABLE' } });
    });

    it('an eligible attorney sees the detail with no client field at all', async () => {
      const attorneyId = await newAttorney({});
      const caseId = await newCase({ title: 'Detail case' });
      const detail = await feed.getDetailForAttorney(attorneyId, caseId);
      expect(detail.id).toBe(caseId);
      expect(detail.description).toContain('turnpike');
      const keys = Object.keys(detail);
      for (const f of ['client', 'clientId', 'clientName', 'phone', 'email']) {
        expect(keys).not.toContain(f);
      }
    });
  });

  describe('view tracking: dedup + batched flush', () => {
    it('the same attorney viewing twice counts once in cases.view_count', async () => {
      const attorneyId = await newAttorney({});
      const other = await newAttorney({});
      const caseId = await newCase({ title: 'Viewed case' });

      await feed.recordView(attorneyId, caseId);
      await feed.recordView(attorneyId, caseId); // dedup: not counted again
      await feed.recordView(other, caseId); // different attorney: counted

      const { casesUpdated } = await viewTracking.flushPending();
      expect(casesUpdated).toBeGreaterThanOrEqual(1);
      const row = await root.case.findUniqueOrThrow({ where: { id: caseId } });
      expect(row.view_count).toBe(2);
    });

    it('recordView on a case the attorney cannot see is CASE_NOT_AVAILABLE, not tracked', async () => {
      const attorneyId = await newAttorney({ licenses: [['NY', 'verified']] });
      const caseId = await newCase({ states: ['NJ'] });
      await expect(feed.recordView(attorneyId, caseId)).rejects.toMatchObject({
        response: { code: 'CASE_NOT_AVAILABLE' },
      });
    });
  });

  describe('"Save" a case', () => {
    it('save then unsave round-trips through saved_items', async () => {
      const attorneyId = await newAttorney({});
      const caseId = await newCase({ title: 'Save me' });
      await feed.save(
        { userId: attorneyId, role: 'attorney' },
        { itemType: 'case', itemId: caseId },
      );
      const detail1 = await feed.getDetailForAttorney(attorneyId, caseId);
      expect(detail1.isSaved).toBe(true);

      await feed.unsave(
        { userId: attorneyId, role: 'attorney' },
        { itemType: 'case', itemId: caseId },
      );
      const detail2 = await feed.getDetailForAttorney(attorneyId, caseId);
      expect(detail2.isSaved).toBe(false);
    });

    it('a client cannot save a case (only attorneys, §11.2)', async () => {
      const caseId = await newCase({ title: 'Client cannot save' });
      await expect(
        feed.save(
          { userId: clientId, role: 'client' },
          { itemType: 'case', itemId: caseId },
        ),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('EXPLAIN: the feed query never full-scans cases/case_states (stage 4.3)', () => {
    // Same rationale as test/db-roles-indexes.e2e-spec.ts: with only a
    // handful of rows a full scan is genuinely cheapest, so the check
    // must run against a realistic background volume.
    async function plan(sql: Prisma.Sql): Promise<string> {
      const rows = await root.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL optimizer_use_forecasts = off');
        return tx.$queryRaw<{ info: string }[]>(Prisma.sql`EXPLAIN ${sql}`);
      });
      return rows.map((r) => r.info).join('\n');
    }

    it('EXPLAIN of buildVisibleCasesSql uses indexes only, with and without filters/cursor', async () => {
      const attorneyId = await newAttorney({
        licenses: [
          ['NJ', 'verified'],
          ['NY', 'verified'],
        ],
      });
      await root.$executeRaw`
        INSERT INTO practice_areas (parent_id, code, name_en, i18n_key, sort)
        SELECT (SELECT id FROM practice_areas WHERE code = 'dui_and_dwi'),
               'dui_and_dwi.s43_' || g, 's43 ' || g, 'practice.s43_' || g, g
        FROM generate_series(1, 60) AS g
        ON CONFLICT (code) DO NOTHING`;
      await root.$executeRaw`
        INSERT INTO cases (client_id, title, description, practice_area_id,
                           primary_state_code, budget_mode, status, updated_at)
        SELECT ${clientId}::UUID, 's43bg ' || g, 'background case ' || g,
               (SELECT id FROM practice_areas
                  WHERE code = 'dui_and_dwi.s43_' || (1 + g % 60)),
               (ARRAY['NY','CA','TX','FL','IL','PA','OH','GA','NC','MI'])[1 + g % 10],
               'clarify_later',
               (CASE WHEN g % 3 = 0 THEN 'closed' ELSE 'open' END)::case_status,
               now()
        FROM generate_series(1, 3000) AS g`;
      await root.$executeRaw`
        INSERT INTO case_states (case_id, state_code, is_primary)
        SELECT id, primary_state_code, true FROM cases
        WHERE title LIKE 's43bg %'
        ON CONFLICT DO NOTHING`;
      for (const t of [
        'cases',
        'case_states',
        'attorney_licenses',
        'attorney_practice_areas',
      ]) {
        await root.$executeRawUnsafe(`ANALYZE ${t}`);
      }

      const variants: Prisma.Sql[] = [
        buildVisibleCasesSql({ attorneyId, limit: 20 }),
        buildVisibleCasesSql({ attorneyId, state: 'NJ', limit: 20 }),
        buildVisibleCasesSql({
          attorneyId,
          practiceAreaId: leaf['traffic_tickets.speeding'],
          limit: 20,
        }),
        buildVisibleCasesSql({
          attorneyId,
          cursor: { createdAt: new Date(), id: randomUUID() },
          limit: 20,
        }),
      ];
      for (const sql of variants) {
        const nodes = (await plan(sql)).split('•').slice(1);
        const casesNodes = nodes.filter((n) =>
          /table: (cases|case_states)@/.test(n),
        );
        expect(casesNodes.length).toBeGreaterThan(0);
        for (const node of casesNodes) {
          expect(node).not.toMatch(/FULL SCAN/);
          if (/cases@cases_pkey/.test(node)) {
            expect(node).toMatch(/lookup join|index join/);
          }
        }
      }
    });
  });
});
