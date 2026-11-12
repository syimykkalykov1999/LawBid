import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';
import { inQuietWindow } from '../src/modules/admin-launch/infra/infra-change.logic';
import { PartitionService } from '../src/partitioning/partition.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { ShardMoveService } from '../src/sharding/move/shard-move.service';
import { shardContext } from '../src/sharding/shard-context';

/**
 * Owner 2026-11-11 (db.shards_mode = Авто, «создавай условия и проверяй
 * сам»): the full automatic first split on real PostgreSQL. A second
 * database that exists but holds no shard (E2E_TWO_DB=empty, what the
 * «Второй сервер базы» switch creates), the split threshold lowered in the
 * settings (the real condition), the same call the shard-move cron makes:
 * the system plans and moves the upper half of the shards by itself, the
 * rows of a moved shard live on the new server only, and the app reads them
 * there. Runs only in that mode (the moves change the whole map).
 */
const run = (process.env.E2E_TWO_DB ?? '').trim().toLowerCase() === 'empty';
(run ? describe : describe.skip)(
  'automatic first split (real PostgreSQL)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let raw: { primary: PrismaClient; db1: PrismaClient };

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      prisma = app.get(PrismaService);
      raw = {
        primary: new PrismaClient(),
        db1: new PrismaClient({
          datasourceUrl: (
            JSON.parse(process.env.DATABASE_URL_SHARDS!) as Record<
              string,
              string
            >
          ).db1,
        }),
      };
    }, 120_000);

    afterAll(async () => {
      await raw.primary.$disconnect();
      await raw.db1.$disconnect();
      await app.close();
    });

    /** A person whose own rows (notifications) live in logical shard [s]. */
    const personInShard = async (s: number) => {
      const id = `${randomUUID().slice(0, 34)}${s.toString(16).padStart(2, '0')}`;
      await prisma.global().user.create({ data: { id, role: 'client' } });
      for (let i = 0; i < 3; i++) {
        await shardContext.run(s, () =>
          prisma.notification.create({
            data: {
              user_id: id,
              type: 'contact_joined',
              category: 'messages',
              payload: {},
            },
          }),
        );
      }
      return id;
    };

    it('over the threshold, in the hours: the upper half moves by itself and stays readable', async () => {
      const onDb1 = () =>
        raw.primary.shardMap.count({
          where: { physical_db: 'db1', state: 'active' },
        });
      expect(await onDb1()).toBe(0);
      const moving = await personInShard(200); // upper half: moves
      const staying = await personInShard(10); // lower half: stays

      // The real condition: the split threshold below the database's size.
      await prisma.global().appConfig.upsert({
        where: { key: 'growth.shard_db_gb' },
        create: { key: 'growth.shard_db_gb', value: 0.001 },
        update: { value: 0.001 },
      });
      await app.get<Redis>(REDIS_CLIENT).del('config:app_config');
      const settings = app.get(AppSettingsService);
      const growth = await app.get(PartitionService).shardSignal();
      expect(growth.status).toBe('red');
      expect(growth.targetReady).toBe(true);

      // Exactly what the shard-move cron does with db.shards_mode = auto.
      const moves = app.get(ShardMoveService);
      const target = await moves.autoSplit({
        mode: (await settings.string('db.shards_mode')) ?? 'auto',
        growth,
        inWindow: inQuietWindow('', new Date()),
      });
      expect(target).toBe('db1');
      // The queue runs in the background; wait until it is empty.
      for (let i = 0; i < 1800; i++) {
        const left = await raw.primary.shardMove.count({
          where: { status: 'running' },
        });
        if (left === 0) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      const failed = await raw.primary.shardMove.findMany({
        where: { status: 'failed' },
        select: { logical_shard: true, error: true },
      });
      expect(failed).toEqual([]);
      expect(await onDb1()).toBe(128);

      // The moved person's rows are on the new server; the old copies stay on
      // the primary 7 days for a rollback (cleanup); the app reads ONE copy.
      expect(
        await raw.db1.notification.count({ where: { user_id: moving } }),
      ).toBe(3);
      expect(
        await raw.primary.notification.count({ where: { user_id: moving } }),
      ).toBe(3);
      expect(
        await prisma.notification.count({ where: { user_id: moving } }),
      ).toBe(3);
      expect(
        await prisma.notification.count({ where: { user_id: staying } }),
      ).toBe(3);

      // Nothing more starts by itself: the server is no longer empty.
      expect(
        await moves.autoSplit({ mode: 'auto', growth, inWindow: true }),
      ).toBeNull();
    }, 1_900_000);
  },
);
