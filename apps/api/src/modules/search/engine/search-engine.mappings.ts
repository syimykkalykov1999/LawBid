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

/** Revision of the mappings below. Bump it when a mapping changes: the admin
 * page then shows "mapping outdated" and a zero-downtime reindex (see
 * docs/runbooks/search-reindex.md) builds a new index generation; nothing is
 * rebuilt by itself. It is stored in each index's `_meta.mapping_version`. */
export const MAPPING_VERSION = 1;

/**
 * Names (owner 2026-10-25, alias-based zero-downtime reindex):
 *   read alias   `<prefix>-<entity>`        searches go here
 *   write alias  `<prefix>-<entity>-write`  the indexer writes here
 *   physical     `<prefix>-<entity>-v<N>`   an index generation (N grows by
 *                                            one with every reindex)
 * A pre-alias deployment has just `<prefix>-<entity>-v1`: it is adopted by
 * adding the two aliases (no data moves).
 */
export function readAlias(prefix: string, entity: SearchEntity): string {
  return `${prefix}-${entity}`;
}
export function writeAlias(prefix: string, entity: SearchEntity): string {
  return `${prefix}-${entity}-write`;
}
export function physicalIndex(
  prefix: string,
  entity: SearchEntity,
  generation: number,
): string {
  return `${prefix}-${entity}-v${generation}`;
}
/** Generation number of a physical index name of [entity], else null. */
export function generationOf(
  prefix: string,
  entity: SearchEntity,
  name: string,
): number | null {
  const head = `${prefix}-${entity}-v`;
  if (!name.startsWith(head)) return null;
  const rest = name.slice(head.length);
  return /^[1-9]\d*$/.test(rest) ? Number(rest) : null;
}
export function templateName(prefix: string, entity: SearchEntity): string {
  return `${prefix}-${entity}-tpl`;
}

/**
 * Composable index template of [entity]: every generation `-v<N>` created
 * later gets the same settings and mappings from the engine itself, so a
 * mapping change is a code change plus a new generation (no hand-built PUT).
 */
export function templateBody(
  prefix: string,
  entity: SearchEntity,
): Record<string, unknown> {
  const def = MAPPINGS[entity] as {
    settings: Record<string, unknown>;
    mappings: Record<string, unknown>;
  };
  return {
    index_patterns: [`${prefix}-${entity}-v*`],
    priority: 100,
    template: {
      settings: structuredClone(def.settings),
      mappings: {
        ...structuredClone(def.mappings),
        _meta: { mapping_version: MAPPING_VERSION },
      },
    },
    _meta: { owner: 'lawbid', mapping_version: MAPPING_VERSION },
  };
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
