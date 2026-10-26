import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Owner 2026-10-15: a topic (hashtag) takes the cover of the practice its
 * posts mostly belong to (top-level category code), so no topic is a grey
 * square. One query for any number of tags; tags without a practiced post
 * are simply absent from the map.
 */
export async function tagCategories(
  prisma: PrismaService,
  tags: string[],
): Promise<Map<string, string>> {
  if (tags.length === 0) return new Map();
  const rows = await prisma.$queryRaw<
    { tag: string; category: string | null }[]
  >`
    SELECT t.tag_lower AS tag, (
      SELECT COALESCE(cat.code, pa.code)
      FROM post_tags pt
      JOIN posts p ON p.id = pt.post_id
        AND p.status = 'published' AND p.deleted_at IS NULL AND p.archived_at IS NULL
        AND p.practice_area_id IS NOT NULL
      JOIN practice_areas pa ON pa.id = p.practice_area_id
      LEFT JOIN practice_areas cat ON cat.id = pa.parent_id
      WHERE pt.tag_id = t.id
      GROUP BY COALESCE(cat.code, pa.code)
      ORDER BY count(*) DESC, COALESCE(cat.code, pa.code)
      LIMIT 1) AS category
    FROM tags t
    WHERE t.tag_lower = ANY(${tags}::TEXT[])`;
  const out = new Map(
    rows.flatMap((r) => (r.category ? [[r.tag, r.category] as const] : [])),
  );
  // Owner 2026-10-15: no topic is left without a cover — a tag nobody filed
  // under a practice takes the one its name points to (any language), and
  // failing that a stable one.
  const missing = tags.filter((t) => !out.has(t));
  if (missing.length > 0) {
    const tops = await prisma.$queryRaw<{ code: string }[]>`
      SELECT code FROM practice_areas
      WHERE parent_id IS NULL AND is_active ORDER BY code`;
    for (const tag of missing) {
      const found = await prisma.$queryRaw<{ category: string }[]>`
        SELECT COALESCE(cat.code, pa.code) AS category
        FROM practice_areas pa
        LEFT JOIN practice_areas cat ON cat.id = pa.parent_id
        JOIN i18n_keys k ON k.key IN (pa.i18n_key, pa.i18n_key || '.kw')
        JOIN i18n_translations t ON t.key_id = k.id
        WHERE pa.is_active AND length(${tag}) >= 3 AND (
          public.f_unaccent(' ' || replace(lower(t.value), ',', ' '))
            LIKE ${'% ' + tag.replace(/[%_\\]/g, '') + '%'}
          OR (t.lang = 'en' AND length(t.value) >= 5
              AND position(public.f_unaccent(lower(t.value)) IN ${tag}) > 0))
        ORDER BY pa.parent_id IS NULL DESC, pa.sort
        LIMIT 1`;
      if (found[0]) {
        out.set(tag, found[0].category);
      } else if (tops.length > 0) {
        let h = 0;
        for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) & 0x7fffffff;
        out.set(tag, tops[h % tops.length].code);
      }
    }
  }
  return out;
}
