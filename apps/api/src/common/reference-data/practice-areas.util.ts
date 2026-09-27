// docs/02_DATABASE.md §3.2: practice_areas seed parsing + the code
// generation rule. Shared by prisma/seed.ts and its unit tests.

export interface PracticeAreaSeedCategory {
  code: string;
  name_en: string;
  children: { code: string; name_en: string }[];
}

export interface PracticeAreaSeedRow {
  code: string;
  parent_code: string | null;
  name_en: string;
  i18n_key: string;
  sort: number;
}

// §3.2 rule: lowercase, `&` -> `and`, every non-letter/digit -> `_`,
// repeated `_` collapsed, leading/trailing `_` trimmed.
export function practiceAreaSnake(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Flattens the seed JSON into category rows followed by leaf rows, and
// throws if any stored code breaks the §3.2 rule or is duplicated — the
// JSON is hand-editable ("дополнять список потом"), so the seed must not
// trust it blindly.
export function flattenPracticeAreaSeed(
  categories: PracticeAreaSeedCategory[],
): PracticeAreaSeedRow[] {
  const rows: PracticeAreaSeedRow[] = [];
  categories.forEach((cat, catIdx) => {
    const expected = practiceAreaSnake(cat.name_en);
    if (cat.code !== expected) {
      throw new Error(
        `practice_areas: category "${cat.name_en}" has code "${cat.code}", expected "${expected}"`,
      );
    }
    rows.push({
      code: cat.code,
      parent_code: null,
      name_en: cat.name_en,
      i18n_key: `practice.${cat.code}`,
      sort: catIdx,
    });
    cat.children.forEach((leaf, leafIdx) => {
      const expectedLeaf = `${cat.code}.${practiceAreaSnake(leaf.name_en)}`;
      if (leaf.code !== expectedLeaf) {
        throw new Error(
          `practice_areas: "${leaf.name_en}" has code "${leaf.code}", expected "${expectedLeaf}"`,
        );
      }
      rows.push({
        code: leaf.code,
        parent_code: cat.code,
        name_en: leaf.name_en,
        i18n_key: `practice.${leaf.code}`,
        sort: leafIdx,
      });
    });
  });

  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.code)) {
      throw new Error(`practice_areas: duplicate code "${row.code}"`);
    }
    seen.add(row.code);
  }
  return rows;
}
