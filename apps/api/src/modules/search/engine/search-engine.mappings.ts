/**
 * Search-ready (owner 2026-10-24, docs/architecture/SEARCH_READY.md): what
 * lives in the search engine. The engine only FINDS candidates (ids); the
 * database still decides access, filters and the final order, so the index
 * holds just the text and the few fields a query narrows by.
 */
export const SEARCH_ENTITIES = [
  'person',
  'case',
  'post',
  'question',
  'tag',
] as const;
export type SearchEntity = (typeof SEARCH_ENTITIES)[number];

export function isSearchEntity(v: string): v is SearchEntity {
  return (SEARCH_ENTITIES as readonly string[]).includes(v);
}

/** Bump when a mapping below changes: the reindex then rebuilds everything
 * (the indexer notices it by itself while `search.engine` is not postgres). */
export const MAPPING_VERSION = 1;

/** The index of an entity: `<prefix>-<entity>` (an alias-free single index). */
export function indexName(prefix: string, entity: SearchEntity): string {
  return `${prefix}-${entity}-v${MAPPING_VERSION}`;
}

/** Text fields share one analyzer: lower case, accents folded (é = e), ё = е.
 * `ngram` is for "contains" matches inside names. */
const SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    char_filter: {
      yo: { type: 'mapping', mappings: ['ё=>е', 'Ё=>Е'] },
    },
    tokenizer: {
      tri: {
        type: 'ngram',
        min_gram: 3,
        max_gram: 3,
        token_chars: ['letter', 'digit'],
      },
    },
    analyzer: {
      lb_text: {
        type: 'custom',
        char_filter: ['yo'],
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding'],
      },
      lb_tri: {
        type: 'custom',
        char_filter: ['yo'],
        tokenizer: 'tri',
        filter: ['lowercase', 'asciifolding'],
      },
    },
    normalizer: {
      lb_lower: { type: 'custom', filter: ['lowercase', 'asciifolding'] },
    },
  },
};

const text = { type: 'text', analyzer: 'lb_text' };
const keyword = { type: 'keyword' };
const lowerKeyword = { type: 'keyword', normalizer: 'lb_lower' };

export const MAPPINGS: Record<SearchEntity, Record<string, unknown>> = {
  person: {
    settings: SETTINGS,
    mappings: {
      dynamic: 'strict',
      properties: {
        role: keyword,
        username: lowerKeyword,
        full_name: {
          ...text,
          fields: { tri: { type: 'text', analyzer: 'lb_tri' } },
        },
        // Spelling keys from Postgres (f_name_skel / f_name_cons): a name in
        // any alphabet and spelling matches the same way it does there.
        name_skel: { type: 'text', analyzer: 'lb_tri' },
        name_cons: { type: 'text', analyzer: 'lb_tri' },
        verified: { type: 'boolean' },
        rating: { type: 'float' },
        languages: keyword,
        client_state: keyword,
        practice_ids: keyword,
        practice_ids_all: keyword,
        practice_names: lowerKeyword,
        states: keyword,
        state_names: lowerKeyword,
      },
    },
  },
  case: {
    settings: SETTINGS,
    mappings: {
      dynamic: 'strict',
      properties: {
        title: text,
        description: text,
        state: keyword,
        states: keyword,
        state_name: lowerKeyword,
        city: lowerKeyword,
        practice_ids: keyword,
        created_at: { type: 'date' },
      },
    },
  },
  post: {
    settings: SETTINGS,
    mappings: {
      dynamic: 'strict',
      properties: {
        title: text,
        body: text,
        tags: keyword,
        content_class: keyword,
        kind: keyword,
        practice_ids: keyword,
        created_at: { type: 'date' },
      },
    },
  },
  question: {
    settings: SETTINGS,
    mappings: {
      dynamic: 'strict',
      properties: {
        title: text,
        body: text,
        answers: text,
        practice_ids: keyword,
        created_at: { type: 'date' },
      },
    },
  },
  tag: {
    settings: SETTINGS,
    mappings: {
      dynamic: 'strict',
      properties: {
        tag: lowerKeyword,
      },
    },
  },
};
