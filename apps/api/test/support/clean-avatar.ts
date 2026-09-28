import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Gives [userId] a clean avatar the way the files pipeline leaves it
 * (purpose avatar, scan_status clean, 1024 px) without going through S3 —
 * for suites that only need the docs/03 §4.1 "photo is mandatory"
 * onboarding requirement satisfied (OQ-012).
 */
export async function attachCleanAvatar(
  prisma: PrismaService,
  userId: string,
): Promise<string> {
  const file = await prisma.file.create({
    data: {
      owner_user_id: userId,
      purpose: 'avatar',
      s3_bucket: 'lawbid-e2e-media',
      s3_key: `avatar/${userId}/${randomUUID()}`,
      mime: 'image/jpeg',
      size_bytes: 1024n,
      sha256: 'a'.repeat(64),
      width: 1024,
      height: 1024,
      scan_status: 'clean',
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { avatar_file_id: file.id },
  });
  return file.id;
}
