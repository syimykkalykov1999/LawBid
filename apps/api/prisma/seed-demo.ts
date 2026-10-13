// LawBid — demo data for the local / dev database, one command:
//
//   npm run seed:demo --workspace apps/api
//
// 1. the demo world (people, cases, bids, chats, reviews, posts,
//    notifications ...) via the same code the in-app demo mode uses;
// 2. the content layer (seed-demo/content.ts): photos, carousels,
//    documents, comments, likes, saves, promotions, avatars.
//
// Idempotent. Needs DATABASE_URL (and S3_* for pictures). Reads apps/api/.env.
// Set DEMO_SEED_VIDEO_STUBS=1 to add reel posts (they only play when a
// Bunny library is configured).
import { PrismaClient } from '@prisma/client';
import { seedDemoWorld } from '../src/modules/demo/demo-seed';
import { seedDemoContent } from './seed-demo/content';
import { seedCaseWorkspace } from './seed-demo/workspace';

for (const file of ['.env', 'apps/api/.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // no such file: fine, the environment may already be set.
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (/prod|amazonaws|rds\./i.test(url)) {
    throw new Error(
      'seed:demo refuses to run against a production-looking DATABASE_URL',
    );
  }
  const prisma = new PrismaClient();
  try {
    const world = await seedDemoWorld(prisma);
    console.log('world  :', world);
    const content = await seedDemoContent(prisma, {
      videoStubs: process.env.DEMO_SEED_VIDEO_STUBS === '1',
    });
    console.log('content:', content);
    console.log('workspace:', await seedCaseWorkspace(prisma));
    if (content.mediaSkipped) {
      console.warn(
        'S3_BUCKET_MEDIA / S3_BUCKET_DOCUMENTS are not set: pictures and documents were skipped.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
