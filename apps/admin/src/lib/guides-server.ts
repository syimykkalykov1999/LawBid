import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseGuide, type Guide } from '@/lib/guides';

/** apps/admin/content/guides (the standalone image runs from apps/admin and
 * next.config.ts traces this folder into the bundle). */
export const GUIDES_DIR = path.join(process.cwd(), 'content', 'guides');

export async function loadGuides(dir: string = GUIDES_DIR): Promise<Guide[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  const guides = await Promise.all(
    files.map(async (f) => {
      try {
        return parseGuide(await readFile(path.join(dir, f), 'utf8'));
      } catch (e) {
        throw new Error(`${f}: ${(e as Error).message}`);
      }
    }),
  );
  return guides.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
}
