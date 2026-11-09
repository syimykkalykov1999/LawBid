import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../../src/redis/redis.constants';

/**
 * Stores staff.* switches in app_config for a suite that describes the
 * behaviour WITHOUT the staff package (legacy roles, legacy support
 * routing). Since 2026-11-09 the package is on / «Авто» by default, so such
 * a suite says «off» explicitly instead of counting on the default. Clears
 * the config cache; `restore` deletes the rows again.
 */
export async function storeStaffSwitches(
  app: INestApplication,
  values: Record<string, boolean | 'off' | 'on' | 'auto'>,
): Promise<() => Promise<void>> {
  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS_CLIENT);
  for (const [key, value] of Object.entries(values)) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  await redis.del('config:app_config');
  return async () => {
    await prisma.appConfig.deleteMany({
      where: { key: { in: Object.keys(values) } },
    });
    await redis.del('config:app_config');
  };
}
