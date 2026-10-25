import { randomUUID } from 'node:crypto';
import { OpenSearchClient } from './opensearch.client';
import { SEARCH_ENTITIES, type SearchEntity } from './search-engine.mappings';
import {
  caseQuery,
  peopleQuery,
  postQuery,
  questionQuery,
  tagQuery,
} from './search-engine.queries';

/**
 * OPTIONAL integration test against a real OpenSearch (owner 2026-10-24):
 * skipped unless OPENSEARCH_TEST_URL is set. Run one locally with
 *   docker run -d --name lb-os -p 9200:9200 -e discovery.type=single-node \
 *     -e DISABLE_SECURITY_PLUGIN=true -e DISABLE_INSTALL_DEMO_CONFIG=true \
 *     opensearchproject/opensearch:2.15.0
 *   OPENSEARCH_TEST_URL=http://localhost:9200 npx jest opensearch.integration
 * It proves the index mappings are accepted and the query DSL finds what the
 * Postgres search would (accents, ё/е, prefix, typos, names, place).
 */
const url = process.env.OPENSEARCH_TEST_URL;
const d = url ? describe : describe.skip;
const W = { title: 1, text: 0.2 };

d('OpenSearch (real engine)', () => {
  jest.setTimeout(60_000);
  const prefix = `lbtest${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const client = new OpenSearchClient(undefined, {
    get: (k: string) => ({ OPENSEARCH_URL: url, OPENSEARCH_PREFIX: prefix })[k],
  });
  const ids = (e: SearchEntity, q: Record<string, unknown>) =>
    client.searchIds(e, q, 20, 5000);

  beforeAll(async () => {
    for (const e of SEARCH_ENTITIES) await client.ensureIndex(e);
    const res = await client.bulk([
      {
        entity: 'post',
        id: 'p1',
        doc: {
          title: 'Green card for spouses',
          body: 'How to apply for an immigration visa',
          tags: ['immigration'],
          content_class: 'legal',
          kind: 'post',
          practice_ids: [],
          created_at: '2026-10-01T00:00:00Z',
        },
      },
      {
        entity: 'post',
        id: 'p2',
        doc: {
          title: null,
          body: 'Развод и раздел имущества',
          tags: [],
          content_class: 'general',
          kind: 'post',
          practice_ids: [],
          created_at: '2026-10-02T00:00:00Z',
        },
      },
      {
        entity: 'case',
        id: 'c1',
        doc: {
          title: 'Need help with a lease dispute',
          description: 'Landlord keeps my deposit',
          state: 'NY',
          states: ['NY'],
          state_name: 'new york',
          city: 'brooklyn',
          practice_ids: ['pa1'],
          created_at: '2026-10-01T00:00:00Z',
        },
      },
      {
        entity: 'person',
        id: 'u1',
        doc: {
          role: 'attorney',
          username: 'emilybrown',
          full_name: 'emily brown',
          name_skel: 'emilibrovn',
          name_cons: 'mlbrwn',
          verified: true,
          rating: 4.8,
          languages: ['en'],
          client_state: null,
          practice_ids: ['pa1'],
          practice_ids_all: ['pa1', 'cat1'],
          practice_names: ['divorce'],
          states: ['NY'],
          state_names: ['new york'],
        },
      },
      {
        entity: 'person',
        id: 'u2',
        doc: {
          role: 'client',
          username: 'johnny',
          full_name: 'john smith',
          name_skel: 'jonsmit',
          name_cons: 'jnsmth',
          verified: false,
          rating: 0,
          languages: [],
          client_state: 'CA',
          practice_ids: [],
          practice_ids_all: [],
          practice_names: [],
          states: [],
          state_names: [],
        },
      },
      {
        entity: 'question',
        id: 'q1',
        doc: {
          title: 'Can my landlord evict me?',
          body: 'Notice received',
          answers: 'Yes after a court order',
          practice_ids: [],
          created_at: '2026-10-01T00:00:00Z',
        },
      },
      { entity: 'tag', id: 't1', doc: { tag: 'immigration' } },
      { entity: 'tag', id: 't2', doc: { tag: 'immunity' } },
    ]);
    expect(res.failed).toEqual([]);
    for (const e of SEARCH_ENTITIES) {
      // make the documents searchable now
      await fetch(`${url}/${prefix}-${e}-v1/_refresh`, { method: 'POST' });
    }
  });

  afterAll(async () => {
    for (const e of SEARCH_ENTITIES) await client.dropIndex(e);
  });

  it('posts: every word, the last one a prefix, accents and ё/е ignored', async () => {
    expect(await ids('post', postQuery('green ca', {}, W, []))).toEqual(['p1']);
    expect(await ids('post', postQuery('GREEN CARD', {}, W, []))).toEqual([
      'p1',
    ]);
    expect(await ids('post', postQuery('развод', {}, W, []))).toEqual(['p2']);
    expect(await ids('post', postQuery('green zzz', {}, W, []))).toEqual([]);
  });

  it('posts: typos through the fuzzy fallback, filters by tag and class', async () => {
    expect(await ids('post', postQuery('gren card', {}, W, [], true))).toEqual([
      'p1',
    ]);
    expect(
      await ids('post', postQuery('visa', { tag: 'immigration' }, W, [])),
    ).toEqual(['p1']);
    expect(
      await ids('post', postQuery('visa', { contentClass: 'general' }, W, [])),
    ).toEqual([]);
  });

  it('cases: text, place (state code / city word), state filter', async () => {
    expect(await ids('case', caseQuery('lease', {}, W, [], 'lease'))).toEqual([
      'c1',
    ]);
    expect(await ids('case', caseQuery('ny', {}, W, [], 'ny'))).toEqual(['c1']);
    expect(await ids('case', caseQuery('brook', {}, W, [], 'brook'))).toEqual([
      'c1',
    ]);
    expect(
      await ids('case', caseQuery('lease', { state: 'CA' }, W, [], 'lease')),
    ).toEqual([]);
  });

  it('people: username, name contains, spelling keys, practice, state, filters', async () => {
    const ctx = {
      namedPractices: [],
      synonymPractices: [],
      nameKeys: [],
      withClients: true,
    };
    expect(await ids('person', peopleQuery('emilybrown', {}, ctx))).toContain(
      'u1',
    );
    expect(await ids('person', peopleQuery('emil', {}, ctx))).toContain('u1');
    expect(await ids('person', peopleQuery('brown emily', {}, ctx))).toContain(
      'u1',
    );
    expect(await ids('person', peopleQuery('smith', {}, ctx))).toContain('u2');
    // «Эмили Браун» arrives as spelling keys computed by Postgres.
    const keys = { ...ctx, nameKeys: [{ skel: 'emili', cons: 'mlb' }] };
    expect(await ids('person', peopleQuery('эмили', {}, keys))).toContain('u1');
    expect(await ids('person', peopleQuery('divorce', {}, ctx))).toContain(
      'u1',
    );
    expect(
      await ids(
        'person',
        peopleQuery('x', { state: 'CA' }, { ...ctx, namedPractices: [] }),
      ),
    ).not.toContain('u1');
    expect(
      await ids('person', peopleQuery('emily', { role: 'client' }, ctx)),
    ).not.toContain('u1');
    expect(await ids('person', peopleQuery('emliy', {}, ctx, true))).toContain(
      'u1',
    );
  });

  it('questions search title, text and answers; tags by prefix, sorted', async () => {
    expect(await ids('question', questionQuery('landlord', []))).toEqual([
      'q1',
    ]);
    expect(await ids('question', questionQuery('court order', []))).toEqual([
      'q1',
    ]);
    expect(
      await client.searchIds(
        'tag',
        tagQuery('imm'),
        10,
        5000,
        [{ tag: 'asc' }],
        'tag',
      ),
    ).toEqual(['immigration', 'immunity']);
  });
});
