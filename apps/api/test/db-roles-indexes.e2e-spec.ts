import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * docs/02_DATABASE.md §8 stages 2.6 + 2.7 and the leftover 2.4 item,
 * against a real CockroachDB:
 * - roles (§6.2/6.3): lawbid_app can't UPDATE/DELETE append-only tables,
 *   lawbid_readonly can't read contact tables, lawbid_retention can
 *   delete journal rows;
 * - search (§5.3): name trigram, tag trigram, full-text on posts/cases;
 * - §5.4 "cases visible to an attorney": correct rows, and EXPLAIN of it
 *   and of the §5.2 feed queries never full-scans `cases`.
 */
describe('DB — stage 2.6/2.7 roles, search, indexes', () => {
  // The EXPLAIN test seeds 3000 background cases and runs ANALYZE.
  jest.setTimeout(60_000);
  const root = new PrismaClient();
  const as = (role: string) => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.username = role;
    url.password = '';
    return new PrismaClient({ datasourceUrl: url.toString() });
  };
  const app = as('lawbid_app');
  const readonly = as('lawbid_readonly');
  const retention = as('lawbid_retention');

  let leafSpeeding: string;
  let leafDui: string;
  let attorneyId: string;
  let clientId: string;

  async function upsertLeaf(cat: string, leaf: string): Promise<string> {
    const parent = await root.practiceArea.upsert({
      where: { code: cat },
      create: { code: cat, name_en: cat, i18n_key: `practice.${cat}`, sort: 0 },
      update: {},
    });
    const code = `${cat}.${leaf}`;
    const row = await root.practiceArea.upsert({
      where: { code },
      create: {
        code,
        parent_id: parent.id,
        name_en: leaf,
        i18n_key: `practice.${code}`,
        sort: 0,
      },
      update: {},
    });
    return row.id;
  }

  async function newCase(
    title: string,
    areaId: string,
    states: string[],
    status: 'open' | 'closed' = 'open',
  ): Promise<string> {
    const c = await root.case.create({
      data: {
        client_id: clientId,
        title,
        description: `${title} — details`,
        practice_area_id: areaId,
        primary_state_code: states[0],
        budget_mode: 'clarify_later',
        status,
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
      ['NY', 'New York'],
      ['NJ', 'New Jersey'],
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
    leafSpeeding = await upsertLeaf('traffic_tickets', 'speeding');
    leafDui = await upsertLeaf('dui_and_dwi', 'first_offense_dui');

    const attorney = await root.user.create({
      data: { role: 'attorney', first_name: 'Saul', last_name: 'Goodman' },
    });
    attorneyId = attorney.id;
    await root.attorneyProfile.create({
      data: {
        user_id: attorneyId,
        username: 'BetterCallSaul',
        username_lower: 'bettercallsaul',
        verification_status: 'verified',
      },
    });
    await root.attorneyLicense.createMany({
      data: [
        {
          attorney_id: attorneyId,
          state_code: 'NJ',
          bar_number: `NJ-${randomUUID()}`,
          license_status: 'verified',
        },
        {
          attorney_id: attorneyId,
          state_code: 'CA',
          bar_number: `CA-${randomUUID()}`,
          license_status: 'pending',
        },
      ],
    });
    await root.attorneyPracticeArea.create({
      data: { attorney_id: attorneyId, practice_area_id: leafSpeeding },
    });
    const client = await root.user.create({ data: { role: 'client' } });
    clientId = client.id;
  });

  afterAll(async () => {
    await Promise.all([
      root.$disconnect(),
      app.$disconnect(),
      readonly.$disconnect(),
      retention.$disconnect(),
    ]);
  });

  describe('roles (§6.2/6.3)', () => {
    it('lawbid_app can INSERT/SELECT case_journal but not UPDATE/DELETE', async () => {
      const caseId = await newCase('Journal case', leafSpeeding, ['NY']);
      const row = await app.caseJournal.create({
        data: {
          case_id: caseId,
          client_id: clientId,
          event_type: 'created',
          payload: {},
          row_hash: 'h',
        },
      });
      expect(await app.caseJournal.count({ where: { case_id: caseId } })).toBe(
        1,
      );
      await expect(
        app.caseJournal.update({
          where: { id: row.id },
          data: { payload: { x: 1 } },
        }),
      ).rejects.toThrow(/privilege/i);
      await expect(
        app.caseJournal.delete({ where: { id: row.id } }),
      ).rejects.toThrow(/privilege/i);
      await expect(
        app.authEvent.deleteMany({ where: { event_type: 'none' } }),
      ).rejects.toThrow(/privilege/i);
      // Ordinary tables stay writable.
      await app.user.update({
        where: { id: clientId },
        data: { theme: 'dark' },
      });
    });

    it('lawbid_retention can delete journal rows', async () => {
      const caseId = await newCase('Retention case', leafSpeeding, ['NY']);
      const row = await root.caseJournal.create({
        data: {
          case_id: caseId,
          client_id: clientId,
          event_type: 'created',
          payload: {},
          row_hash: 'h',
        },
      });
      await retention.caseJournal.delete({ where: { id: row.id } });
      expect(await root.caseJournal.count({ where: { id: row.id } })).toBe(0);
    });

    it('lawbid_readonly reads cases but not users/messages/documents', async () => {
      await readonly.case.count();
      await expect(readonly.user.count()).rejects.toThrow(/privilege/i);
      await expect(readonly.message.count()).rejects.toThrow(/privilege/i);
      await expect(readonly.verificationDocument.count()).rejects.toThrow(
        /privilege/i,
      );
    });
  });

  describe('search (§5.3)', () => {
    it('finds attorneys by fuzzy username and users by full name', async () => {
      const byUsername = await root.$queryRaw<{ user_id: string }[]>`
        SELECT user_id FROM attorney_profiles
        WHERE username_lower % ${'bettercalsaul'}`;
      expect(byUsername.map((r) => r.user_id)).toContain(attorneyId);

      const byName = await root.$queryRaw<{ id: string }[]>`
        SELECT id FROM users WHERE full_name_lower LIKE ${'%goodman%'}`;
      expect(byName.map((r) => r.id)).toContain(attorneyId);
    });

    it('finds tags by trigram and posts/cases by full-text', async () => {
      await root.tag.create({ data: { tag_lower: 'immigration' } });
      const tags = await root.$queryRaw<{ tag_lower: string }[]>`
        SELECT tag_lower FROM tags WHERE tag_lower % ${'imigration'}`;
      expect(tags.map((t) => t.tag_lower)).toContain('immigration');

      const post = await root.post.create({
        data: {
          author_id: attorneyId,
          body: 'What to do after a speeding ticket in New Jersey',
        },
      });
      const posts = await root.$queryRaw<{ id: string }[]>`
        SELECT id FROM posts WHERE search_tsv @@ plainto_tsquery('english', ${'speeding tickets'})`;
      expect(posts.map((p) => p.id)).toContain(post.id);

      const caseId = await newCase('Contested custody hearing', leafDui, [
        'NY',
      ]);
      const cases = await root.$queryRaw<{ id: string }[]>`
        SELECT id FROM cases WHERE search_tsv @@ plainto_tsquery('english', ${'custody'})`;
      expect(cases.map((c) => c.id)).toContain(caseId);
    });
  });

  // §5.4: open + a verified license in any of the case's states + the
  // case's practice area among the attorney's.
  // Canonical §5.4 query (file 04 stage 4.3 must use this shape): matches
  // on the case's primary state go through cases_open_feed_idx
  // (primary_state_code, practice_area_id, created_at DESC) per
  // (licensed state × practice) pair; matches on an additional state go
  // through case_states(state_code, case_id). The naive IN + EXISTS form
  // makes CockroachDB scan every open case and every case_states row.
  const visibleQuery = (attorney: string) => `
    SELECT id FROM (
      SELECT c.id, c.created_at FROM cases c
      WHERE c.status = 'open' AND c.deleted_at IS NULL
        AND (c.primary_state_code, c.practice_area_id) IN (
          SELECT l.state_code, ap.practice_area_id
          FROM attorney_licenses l
          JOIN attorney_practice_areas ap ON ap.attorney_id = l.attorney_id
          WHERE l.attorney_id = '${attorney}' AND l.license_status = 'verified')
      UNION
      SELECT c.id, c.created_at FROM case_states cs
      JOIN cases c ON c.id = cs.case_id
      WHERE NOT cs.is_primary
        AND cs.state_code IN (
          SELECT state_code FROM attorney_licenses
          WHERE attorney_id = '${attorney}' AND license_status = 'verified')
        AND c.status = 'open' AND c.deleted_at IS NULL
        AND c.practice_area_id IN (
          SELECT practice_area_id FROM attorney_practice_areas
          WHERE attorney_id = '${attorney}')
    ) v ORDER BY created_at DESC LIMIT 50`;
  const visibleSql = (attorney: string) =>
    root.$queryRawUnsafe<{ id: string }[]>(visibleQuery(attorney));

  describe('§5.4 cases visible to an attorney (stage 2.7)', () => {
    it('returns only open cases in a verified-license state and a chosen practice', async () => {
      const visiblePrimary = await newCase('NJ speeding', leafSpeeding, ['NJ']);
      const visibleSecondary = await newCase('NY+NJ speeding', leafSpeeding, [
        'NY',
        'NJ',
      ]);
      const wrongState = await newCase('NY only speeding', leafSpeeding, [
        'NY',
      ]);
      const pendingLicense = await newCase('CA speeding', leafSpeeding, ['CA']);
      const wrongPractice = await newCase('NJ DUI', leafDui, ['NJ']);
      const closed = await newCase('NJ closed', leafSpeeding, ['NJ'], 'closed');

      const ids = (await visibleSql(attorneyId)).map((r) => r.id);
      expect(ids).toEqual(
        expect.arrayContaining([visiblePrimary, visibleSecondary]),
      );
      for (const hidden of [
        wrongState,
        pendingLicense,
        wrongPractice,
        closed,
      ]) {
        expect(ids).not.toContain(hidden);
      }
    });

    // The reused e2e DB is TRUNCATEd between runs, so CockroachDB's
    // statistics *forecast* (extrapolated from older runs) can claim the
    // table is nearly empty; plan from the fresh ANALYZE instead.
    async function plan(sql: string): Promise<string> {
      const rows = await root.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL optimizer_use_forecasts = off');
        return tx.$queryRawUnsafe<{ info: string }[]>(`EXPLAIN ${sql}`);
      });
      return rows.map((r) => r.info).join('\n');
    }

    it('EXPLAIN: §5.4 and §5.2 case queries never full-scan cases', async () => {
      // Realistic background volume: with only a handful of rows a full
      // scan is genuinely the cheapest plan, so the check would measure the
      // fixture, not the indexes. 3000 other cases (other practices and
      // states, a third of them closed) make the §5.2/§5.4 predicates
      // selective, as in production.
      // Spread over 60 practice leaves and 10 states, like real traffic
      // over the 344 specializations and 51 states (so the practice and
      // state predicates are as selective as in production).
      await root.$executeRaw`
        INSERT INTO practice_areas (parent_id, code, name_en, i18n_key, sort)
        SELECT (SELECT id FROM practice_areas WHERE code = 'dui_and_dwi'),
               'dui_and_dwi.bg_' || g, 'bg ' || g, 'practice.bg_' || g, g
        FROM generate_series(1, 60) AS g
        ON CONFLICT (code) DO NOTHING`;
      await root.$executeRaw`
        INSERT INTO cases (client_id, title, description, practice_area_id,
                           primary_state_code, budget_mode, status, updated_at)
        SELECT ${clientId}::UUID, 'bg ' || g, 'background case ' || g,
               (SELECT id FROM practice_areas
                  WHERE code = 'dui_and_dwi.bg_' || (1 + g % 60)),
               (ARRAY['NY','CA','TX','FL','IL','PA','OH','GA','NC','MI'])[1 + g % 10],
               'clarify_later',
               (CASE WHEN g % 3 = 0 THEN 'closed' ELSE 'open' END)::case_status,
               now()
        FROM generate_series(1, 3000) AS g`;
      await root.$executeRaw`
        INSERT INTO case_states (case_id, state_code, is_primary)
        SELECT id, primary_state_code, true FROM cases
        WHERE title LIKE 'bg %'
        ON CONFLICT DO NOTHING`;
      // Plans depend on table statistics; a freshly built e2e database has
      // none ("missing stats"), which makes the optimizer's choice random.
      for (const t of [
        'cases',
        'case_states',
        'attorney_licenses',
        'attorney_practice_areas',
      ]) {
        await root.$executeRawUnsafe(`ANALYZE ${t}`);
      }
      const a = attorneyId;
      const queries = [
        // §5.4 (canonical shape, see visibleQuery)
        visibleQuery(a),
        // §5.2 attorney feed by primary state + practice
        `SELECT id FROM cases WHERE status = 'open' AND deleted_at IS NULL
           AND primary_state_code = 'NJ' AND practice_area_id = '${leafSpeeding}'
           ORDER BY created_at DESC LIMIT 20`,
        // §5.2 client "My cases"
        `SELECT id FROM cases WHERE client_id = '${clientId}' AND deleted_at IS NULL
           ORDER BY status, created_at DESC LIMIT 20`,
        // §5.2 crons
        `SELECT id FROM cases WHERE status = 'open' AND last_activity_at < now() - INTERVAL '14 days'`,
        `SELECT id FROM cases WHERE status = 'pending_completion' AND auto_close_at < now()`,
      ];
      for (const q of queries) {
        // Split the plan into nodes ("• scan", "• lookup join", ...). A
        // node touching `cases` must be either a constrained index scan or
        // a lookup by key — never a FULL SCAN (§5.4, stage 2.7).
        const nodes = (await plan(q)).split('•').slice(1);
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
