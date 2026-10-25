import { parseSearchQuery } from '../../../common/search/search-query';
import type {
  AttorneySearchFilters,
  PostSearchFilters,
} from '../search.provider';

/**
 * The query DSL equivalents of the Postgres search (fts-sql.ts and the
 * People branches of postgres-search.provider.ts). They only choose the
 * CANDIDATES; Postgres applies access, filters and the final order.
 *
 *  - every typed word must be present (AND), the last word is a prefix
 *    (`bool_prefix`), like `parseSearchQuery`'s tsquery;
 *  - a word in the title counts `search.weight_title`, in the text
 *    `search.weight_text` (field boosts), like `ftsRank`;
 *  - accents and ё/е are ignored by the index analyzer (`lb_text`);
 *  - nothing found → the typo fallback (fuzzy), like the trigram step.
 */
export type Query = Record<string, unknown>;

export interface TextWeights {
  title: number;
  text: number;
}

/** Candidates asked from the engine, like the Postgres CANDIDATE caps. */
export const CANDIDATES = { people: 1000, cases: 1500, posts: 1000 };

const boost = (w: number) => Math.max(0.01, Number.isFinite(w) ? w : 1);

function textMatch(
  q: string,
  fields: [string, number][],
  fuzzy: boolean,
): Query | null {
  const { plain } = parseSearchQuery(q);
  if (!plain) return null;
  const f = fields.map(([n, b]) => `${n}^${boost(b)}`);
  return fuzzy
    ? {
        multi_match: {
          query: plain,
          fields: f,
          operator: 'and',
          fuzziness: 'AUTO',
          prefix_length: 1,
        },
      }
    : {
        multi_match: {
          query: plain,
          type: 'bool_prefix',
          operator: 'and',
          fields: f,
        },
      };
}

function either(...clauses: (Query | null)[]): Query {
  const should = clauses.filter((c): c is Query => c !== null);
  if (should.length === 0) return { match_none: {} };
  return { bool: { should, minimum_should_match: 1 } };
}

const terms = (field: string, v: string[]): Query | null =>
  v.length ? { terms: { [field]: v } } : null;

// ---------------------------------------------------------------- posts

export function postQuery(
  q: string,
  f: PostSearchFilters,
  w: TextWeights,
  practiceIds: string[],
  fuzzy = false,
): Query {
  const text = textMatch(
    q,
    [
      ['title', w.title],
      ['body', w.text],
    ],
    fuzzy,
  );
  const filter: Query[] = [];
  if (f.tag) filter.push({ term: { tags: f.tag } });
  if (f.contentClass) filter.push({ term: { content_class: f.contentClass } });
  if (f.briefsOnly) filter.push({ term: { kind: 'post' } });
  if (f.since) {
    filter.push({ range: { created_at: { gte: f.since.toISOString() } } });
  }
  return {
    bool: {
      must: [either(text, fuzzy ? null : terms('practice_ids', practiceIds))],
      filter,
    },
  };
}

// ---------------------------------------------------------------- cases

export interface CaseQueryInput {
  state?: string;
  since?: Date;
}

export function caseQuery(
  q: string,
  p: CaseQueryInput,
  w: TextWeights,
  practiceIds: string[],
  place: string,
  fuzzy = false,
): Query {
  const text = textMatch(
    q,
    [
      ['title', w.title],
      ['description', w.text],
    ],
    fuzzy,
  );
  const filter: Query[] = [];
  if (p.state) filter.push({ terms: { states: [p.state.toUpperCase()] } });
  if (p.since) {
    filter.push({ range: { created_at: { gte: p.since.toISOString() } } });
  }
  return {
    bool: {
      must: [
        either(
          text,
          fuzzy ? null : terms('practice_ids', practiceIds),
          fuzzy ? null : casePlace(place),
        ),
      ],
      filter,
    },
  };
}

/** "NY", "new york", "brooklyn": where the case is, not what it says. */
function casePlace(norm: string): Query | null {
  if (norm.length < 2) return null;
  const should: Query[] = [
    { prefix: { state_name: norm } },
    { prefix: { city: norm } },
    { wildcard: { city: `* ${norm}*` } },
  ];
  if (norm.length === 2) should.push({ term: { state: norm.toUpperCase() } });
  return { bool: { should, minimum_should_match: 1 } };
}

// ------------------------------------------------------------ questions

export function questionQuery(
  q: string,
  practiceIds: string[],
  fuzzy = false,
): Query {
  const text = textMatch(
    q,
    [
      ['title', 2],
      ['body', 1],
      ['answers', 0.5],
    ],
    fuzzy,
  );
  return either(text, fuzzy ? null : terms('practice_ids', practiceIds));
}

// ----------------------------------------------------------------- tags

export function tagQuery(prefix: string): Query {
  return { prefix: { tag: prefix.toLowerCase() } };
}

// --------------------------------------------------------------- people

export interface PeopleQueryContext {
  /** Practices whose name in any language the query names (translations). */
  namedPractices: string[];
  /** Practices the query's synonyms point at. */
  synonymPractices: string[];
  /** Spelling keys of the typed words (Postgres f_name_skel / f_name_cons). */
  nameKeys: { skel: string; cons: string }[];
  withClients: boolean;
}

/**
 * Branches of docs/05 §7.3 as `should` clauses: @username (exact, prefix,
 * typo), name (contains, typo, spelling skeleton / consonants), practice
 * name, practice named in another language or by a synonym, licensed state.
 */
export function peopleQuery(
  q: string,
  f: AttorneySearchFilters,
  c: PeopleQueryContext,
  fuzzy = false,
): Query {
  const lower = q.toLowerCase().trim();
  const words = lower
    .split(/\s+/)
    .map((x) => x.replace(/^[@#]+/, ''))
    .filter((x) => x.length >= 2)
    .slice(0, 4);
  const should: Query[] = [
    { term: { username: { value: lower, boost: 10 } } },
    { prefix: { username: { value: lower, boost: 5 } } },
  ];
  if (fuzzy) {
    should.push({ fuzzy: { username: { value: lower, fuzziness: 'AUTO' } } });
    should.push({
      match: {
        full_name: { query: lower, fuzziness: 'AUTO', operator: 'and' },
      },
    });
  } else {
    // name contains the typed text (any word order, accents ignored)
    if (words.length) {
      should.push({
        match: { full_name: { query: words.join(' '), operator: 'and' } },
      });
      should.push({
        bool: {
          must: words.map((x) =>
            x.length >= 3
              ? { match_phrase: { 'full_name.tri': x } }
              : { prefix: { full_name: x } },
          ),
        },
      });
    }
    // across alphabets: every word's skeleton inside the name's skeleton, or
    // its consonants inside the name's consonants.
    const keys = c.nameKeys.filter((k) => k.skel.length >= 2);
    if (keys.length) {
      should.push({
        bool: {
          must: keys.map((k) => ({
            bool: {
              should: [
                { match_phrase: { name_skel: k.skel } },
                ...(k.cons.length >= 3
                  ? [{ match_phrase: { name_cons: k.cons } }]
                  : []),
              ],
              minimum_should_match: 1,
            },
          })),
        },
      });
    }
    if (lower.length >= 2) {
      should.push({
        wildcard: { practice_names: `*${escapeWildcard(lower)}*` },
      });
      should.push({ prefix: { state_names: lower } });
    }
    if (lower.length === 2)
      should.push({ term: { states: lower.toUpperCase() } });
    const byPractice = terms('practice_ids', [
      ...new Set([...c.namedPractices, ...c.synonymPractices]),
    ]);
    if (byPractice) should.push(byPractice);
  }

  const filter: Query[] = [];
  const attorneyOnly =
    f.practiceAreaId !== undefined ||
    f.minRating !== undefined ||
    f.language !== undefined ||
    f.role === 'attorney';
  if (f.role === 'client') filter.push({ term: { role: 'client' } });
  else if (attorneyOnly || !c.withClients) {
    filter.push({ term: { role: 'attorney' } });
  }
  if (f.practiceAreaId) {
    filter.push({ term: { practice_ids_all: f.practiceAreaId } });
  }
  if (f.state) {
    filter.push({
      bool: {
        should: [
          { term: { states: f.state } },
          { term: { client_state: f.state } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  if (f.minRating !== undefined) {
    filter.push({ range: { rating: { gte: f.minRating } } });
  }
  if (f.language) filter.push({ term: { languages: f.language } });
  // «Verified» also means a verified phone for clients: Postgres decides.
  if (f.verifiedOnly && !c.withClients)
    filter.push({ term: { verified: true } });
  return { bool: { should, minimum_should_match: 1, filter } };
}

function escapeWildcard(s: string): string {
  return s.replace(/[\\*?]/g, (m) => `\\${m}`);
}
