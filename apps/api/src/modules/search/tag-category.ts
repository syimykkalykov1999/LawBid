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
        AND p.status = 'published' AND p.deleted_at IS NULL
        AND p.practice_area_id IS NOT NULL
      JOIN practice_areas pa ON pa.id = p.practice_area_id
      LEFT JOIN practice_areas cat ON cat.id = pa.parent_id
      WHERE pt.tag_id = t.id
      GROUP BY COALESCE(cat.code, pa.code)
      ORDER BY count(*) DESC, COALESCE(cat.code, pa.code)
      LIMIT 1) AS category
    FROM tags t
    WHERE t.tag_lower = ANY(${tags}::TEXT[])`;
  return new Map(
    rows.flatMap((r) => (r.category ? [[r.tag, r.category] as const] : [])),
  );
}
