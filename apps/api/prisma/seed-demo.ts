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
import { PasswordService } from '../src/modules/auth/services/password.service';

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
    // Owner 2026-10-13: the demo phones sign in with a password too, so the
    // device check does not need an SMS code (Demo1234!).
    const demoHash = await new PasswordService().hash('Demo1234!');
    const withPassword = await prisma.user.updateMany({
      where: { phone_e164: { in: ['+14155552680', '+14155552681'] } },
      data: { password_hash: demoHash, password_set_at: new Date() },
    });
    console.log('passwords:', withPassword.count);
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
