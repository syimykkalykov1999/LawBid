/**
 * Owner 2026-10-15 ("search like a search engine"): turns what a person
 * typed into a tsquery that works as they expect.
 *  - every word must be present (AND), the LAST word is a prefix
 *    ("green ca" finds "green card"), so results arrive while typing;
 *  - only letters and digits survive (no tsquery syntax can be injected);
 *  - at most [MAX_TOKENS] words of [MAX_TOKEN_LEN] characters.
 */
export const MAX_TOKENS = 8;
const MAX_TOKEN_LEN = 40;

export interface ParsedQuery {
  tokens: string[];
  /** `'green' & 'ca':*` for `to_tsquery`, or '' when nothing searchable. */
  tsquery: string;
  /** Same without the prefix: the planner estimates exact words well. */
  exact: string;
  /** The tokens joined by a space: the trigram (typo) fallback input. */
  plain: string;
}

export function parseSearchQuery(raw: string): ParsedQuery {
  const tokens = (raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((t) => t.slice(0, MAX_TOKEN_LEN))
    .slice(0, MAX_TOKENS);
  const tsquery = tokens
    .map((t, i) => `'${t}'${i === tokens.length - 1 ? ':*' : ''}`)
    .join(' & ');
  const exact = tokens.map((t) => `'${t}'`).join(' & ');
  return { tokens, tsquery, exact, plain: tokens.join(' ') };
}
