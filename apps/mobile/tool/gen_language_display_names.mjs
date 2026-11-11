// Sweep C-c6 (2026-11-09): the name of every app language in every app
// language, for the second line of the language pickers (Telegram-style:
// «Español» / «испанский» in a Russian app). The data is Unicode CLDR as
// shipped in Node's ICU (Intl.DisplayNames, Unicode License v3) — nothing
// is translated by hand. Re-run after the language list changes:
//   node apps/mobile/tool/gen_language_display_names.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const langs = JSON.parse(
  readFileSync(join(root, 'apps/api/prisma/seed/languages.seed.json'), 'utf8'),
).map((l) => l.code);

// App code → the CLDR tag (script for Chinese, `fil` for Tagalog).
const cldr = (code) =>
  ({ zh: 'zh-Hans', 'zh-tw': 'zh-Hant', tl: 'fil', nb: 'nb' })[code] ?? code;

const rows = [];
for (const ui of langs) {
  const tag = cldr(ui);
  if (Intl.DisplayNames.supportedLocalesOf([tag]).length === 0) continue;
  const names = new Intl.DisplayNames([tag], {
    type: 'language',
    fallback: 'none',
  });
  const out = langs.map((code) => {
    const n = names.of(cldr(code));
    if (!n) return '';
    // Sentence case like the app's own lists («испанский» → «Испанский»).
    return n.charAt(0).toLocaleUpperCase(tag) + n.slice(1);
  });
  rows.push([ui, out]);
}

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
let dart = `// GENERATED (not .g.dart, so it is committed) by tool/gen_language_display_names.mjs — do not edit.
// Unicode CLDR ${process.versions.cldr} (Node ICU ${process.versions.icu}),
// Unicode License v3: see THIRD_PARTY_NOTICES.md.

/// The app languages, in the order of every row of [kLanguageDisplayNames].
const List<String> kLanguageDisplayCodes = [
${langs.map((c) => `  ${q(c)},`).join('\n')}
];

/// App language → the name of each of [kLanguageDisplayCodes] in it
/// ('' where CLDR has none). Languages without CLDR data are absent.
const Map<String, List<String>> kLanguageDisplayNames = {
${rows.map(([ui, names]) => `  ${q(ui)}: [\n${names.map((n) => `    ${q(n)},`).join('\n')}\n  ],`).join('\n')}
};
`;
writeFileSync(join(here, '..', 'lib/core/l10n/language_display_names.dart'), dart);
console.log(`${rows.length} interface languages × ${langs.length} names`);
