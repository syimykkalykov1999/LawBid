// Owner 2026-10-26: one-off fix of the profile counters (posts, followers,
// following) that are already wrong in production. Recounts every attorney
// and client profile from the posts / follows tables.
//
//   npm run counters:reconcile --workspace apps/api            DRY RUN: shows how many profiles are wrong
//   npm run counters:reconcile --workspace apps/api -- --apply  fixes them
//
// Safe to repeat. Env: DATABASE_URL. Prints counts only. The same repair
// runs by itself every night (setting counters.drift_sweep, default auto).
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function run(table: 'attorney_profiles' | 'client_profiles') {
  const wrong = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`
    SELECT count(*) AS n FROM ${table} a WHERE
      a.posts_count <> (SELECT count(*) FROM posts p WHERE p.author_id = a.user_id
        AND p.deleted_at IS NULL AND p.archived_at IS NULL AND p.status = 'published')
      OR a.followers_count <> (SELECT count(*) FROM follows f WHERE f.followee_id = a.user_id)
      OR a.following_count <> (SELECT count(*) FROM follows f WHERE f.follower_id = a.user_id)`);
  console.log(`${table}: ${String(wrong[0].n)} profiles with a wrong counter`);
  if (!APPLY) return;
  const fixed = await prisma.$executeRawUnsafe(`
    UPDATE ${table} a SET
      posts_count = (SELECT count(*) FROM posts p WHERE p.author_id = a.user_id
        AND p.deleted_at IS NULL AND p.archived_at IS NULL AND p.status = 'published'),
      followers_count = (SELECT count(*) FROM follows f WHERE f.followee_id = a.user_id),
      following_count = (SELECT count(*) FROM follows f WHERE f.follower_id = a.user_id)
    WHERE a.posts_count <> (SELECT count(*) FROM posts p WHERE p.author_id = a.user_id
        AND p.deleted_at IS NULL AND p.archived_at IS NULL AND p.status = 'published')
      OR a.followers_count <> (SELECT count(*) FROM follows f WHERE f.followee_id = a.user_id)
      OR a.following_count <> (SELECT count(*) FROM follows f WHERE f.follower_id = a.user_id)`);
  console.log(`${table}: fixed ${fixed}`);
}

async function main() {
  await run('attorney_profiles');
  await run('client_profiles');
  if (!APPLY) console.log('Dry run. Add --apply to fix.');
  await prisma.$disconnect();
}
void main();
