// "A non-English cell must not be the English text" (owner 2026-11-03: a Kyrgyz
// UI showed English). Pure function so it can be unit-tested; used by
// scripts/i18n-audit.mjs. Allow list: scripts/i18n-same-as-english.allow.json
//   values       - English texts that are the same in every language (brands,
//                  legal acronyms, units): matched on the English value.
//   perLanguage  - { lang: [keys] } where the English word is the real word of
//                  that language (Video, Chat, Spam in Latin-script languages).
export const norm = (s) => String(s ?? '').trim().toLowerCase();

/** English text with no word in it (digits, emoji, symbols, URL, e-mail): same everywhere. */
export function isLanguageNeutral(en) {
  const t = String(en ?? '').replace(/\{[^}]+\}/g, '');
  return !/\p{L}{2,}/u.test(t) || /^(https?:|www\.|[\w.+-]+@[\w.-]+$)/i.test(t.trim());
}

/**
 * -> [{ key, lang }] of cells that are empty or equal to English (case-insensitive,
 * trimmed) and are not covered by the allow lists.
 */
export function findSameAsEnglish(rows, langs, allow = {}) {
  const values = new Set((allow.values ?? []).map(norm));
  const keys = new Set([...(allow.sameAsEnglishKeys ?? [])]);
  const prefixes = allow.sameAsEnglishPrefixes ?? [];
  const perLanguage = allow.perLanguage ?? {};
  const out = [];
  for (const r of rows) {
    const en = r.cells.en;
    if (!en || isLanguageNeutral(en) || values.has(norm(en)) || keys.has(r.key) || prefixes.some((p) => r.key.startsWith(p))) continue;
    for (const l of langs) {
      if (l === 'en') continue;
      const c = r.cells[l] ?? '';
      if ((c === '' || norm(c) === norm(en)) && !(perLanguage[l] ?? []).includes(r.key)) out.push({ key: r.key, lang: l });
    }
  }
  return out;
}
