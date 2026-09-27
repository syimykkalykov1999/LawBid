import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';
import {
  BAR_LOOKUP_PROVIDER,
  ID_VERIFICATION_PROVIDER,
  type BarLookupProvider,
  type IdVerificationProvider,
} from '../src/modules/verification/providers/verification-providers';

/**
 * docs/03_VERIFICATION_PROFILES.md stage 3.1 acceptance: the modules boot,
 * the migration is applied (e2e DB is built from all migrations), and §9
 * values are read from app_config and cached.
 */
describe('Stage 3.1 — modules, migration, cached settings', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots verification providers as manual stubs', async () => {
    const bar = app.get<BarLookupProvider>(BAR_LOOKUP_PROVIDER);
    const id = app.get<IdVerificationProvider>(ID_VERIFICATION_PROVIDER);
    expect(bar.name).toBe('manual');
    expect(id.name).toBe('manual');
    expect(
      (
        await bar.lookup({
          stateCode: 'NY',
          barNumber: '1',
          firstName: 'A',
          lastName: 'B',
        })
      ).result,
    ).toBe('manual_review');
  });

  it('reads §9 values from app_config and caches them in Redis', async () => {
    const prisma = app.get(PrismaService);
    const redis = app.get<Redis>(REDIS_CLIENT);
    await redis.del('config:app_config');
    await prisma.appConfig.upsert({
      where: { key: 'review.edit_window_days' },
      create: { key: 'review.edit_window_days', value: 21 },
      update: { value: 21 },
    });
    const settings = app.get(AppSettingsService);
    expect(await settings.number('review.edit_window_days')).toBe(21);
    expect(await redis.get('config:app_config')).toContain(
      'review.edit_window_days',
    );
    // Cached: a DB change is not seen until the cache expires.
    await prisma.appConfig.update({
      where: { key: 'review.edit_window_days' },
      data: { value: 30 },
    });
    expect(await settings.number('review.edit_window_days')).toBe(21);
  });

  it('has the file 03 §10 columns', async () => {
    const prisma = app.get(PrismaService);
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE (table_name, column_name) IN (
        ('attorney_profiles', 'username_changed_at'), ('reviews', 'edited_at'),
        ('verification_documents', 'side'), ('verification_requests', 'applicant_comment'),
        ('verification_requests', 'info_request_message'), ('verification_requests', 'rejection_code'),
        ('attorney_licenses', 'rejection_code'), ('attorney_licenses', 'rejection_note'))`;
    expect(cols).toHaveLength(8);
  });
});
