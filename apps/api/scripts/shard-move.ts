/**
 * Shard-ready step 10: command line of the move-shard tool
 * (docs/architecture/SHARDING_READY.md §13, docs/runbooks/shard-move.md).
 *
 *   npm run shard:move --workspace apps/api -- <command> [args]
 *
 *   readiness <toDb>              is the new database configured, reachable, migrated?
 *   plan <shard> <toDb>           DRY RUN of one shard: preflight + row counts + estimate
 *   split-plan <toDb>             which shards "Разделить базу" would move, rows, time
 *   move <shard> <toDb>           queue one shard and run it now (resumable)
 *   split <toDb> [shard,shard..]  queue many (default: the split plan) and run them
 *   resume <moveId>               retry a failed / interrupted move from its saved step
 *   rollback <moveId>             undo (before the flip: delete the copy; after: reverse sync)
 *   cleanup <moveId> [--force]    delete the old rows (after 7 days, or --force)
 *   status                        databases, shard distribution, recent moves
 *   fk-drop [dbKey] [--dry-run]   plan step 9: drop cross-family foreign keys on a database
 *   fk-restore <dbKey>            put the dropped foreign keys back (NOT VALID)
 *   orphans                       run the orphan checker once
 *
 * Needs DATABASE_URL, DATABASE_URL_SHARDS (the new database), REDIS_URL.
 * Only one move runs at a time (Redis lease); the same tool backs the admin
 * button.
 */
import Redis from 'ioredis';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShardMapSync } from '../src/sharding/shard-map-sync';
import { MoveDbPool } from '../src/sharding/move/move-db';
import { ShardMoveService } from '../src/sharding/move/shard-move.service';
import {
  dropCrossFamilyForeignKeys,
  restoreCrossFamilyForeignKeys,
} from '../src/sharding/move/cross-family-fks';
import { OrphanChecker } from '../src/sharding/orphan-checker';

const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const args = rest.filter((a) => !a.startsWith('--'));
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL)
    : undefined;
  const pool = new MoveDbPool();
  const svc = new ShardMoveService(
    prisma,
    new ShardMapSync(prisma, redis),
    redis,
    pool,
  );
  try {
    switch (cmd) {
      case 'readiness':
        out(await svc.readiness(need(args[0], 'toDb')));
        break;
      case 'plan':
        out(
          await svc.dryRun(
            Number(need(args[0], 'shard')),
            need(args[1], 'toDb'),
          ),
        );
        break;
      case 'split-plan':
        out(await svc.splitPlan(need(args[0], 'toDb')));
        break;
      case 'move':
      case 'split': {
        const toDb = need(args[cmd === 'move' ? 1 : 0], 'toDb');
        const shards =
          cmd === 'move'
            ? [Number(need(args[0], 'shard'))]
            : args[1]
              ? args[1].split(',').map(Number)
              : (await svc.splitPlan(toDb)).shards;
        const queued = await svc.startSplit(toDb, shards, null);
        out(queued.map((m) => ({ id: m.id, shard: m.logicalShard })));
        // startSplit already drives the queue in the background; wait for it.
        while ((await svc.store.queued()).length > 0) {
          await new Promise((r) => setTimeout(r, 1000));
        }
        out((await svc.overview()).moves.slice(0, shards.length));
        break;
      }
      case 'resume':
        out(await svc.resume(need(args[0], 'moveId')));
        break;
      case 'rollback':
        out(await svc.rollback(need(args[0], 'moveId')));
        break;
      case 'cleanup':
        out(
          await svc
            .runner()
            .cleanup(need(args[0], 'moveId'), { force: flags.has('--force') }),
        );
        break;
      case 'status':
        out(await svc.overview());
        break;
      case 'fk-drop':
        out(
          await dropCrossFamilyForeignKeys(pool.get(args[0] ?? 'primary'), {
            dryRun: flags.has('--dry-run'),
          }),
        );
        break;
      case 'fk-restore':
        out({
          restored: await restoreCrossFamilyForeignKeys(
            pool.get(need(args[0], 'dbKey')),
          ),
        });
        break;
      case 'orphans':
        out(await new OrphanChecker(redis, pool).run());
        break;
      default:
        console.error(
          'commands: readiness plan split-plan move split resume rollback cleanup status fk-drop fk-restore orphans',
        );
        process.exitCode = 2;
    }
  } finally {
    await svc.close();
    await prisma.onModuleDestroy();
    redis?.disconnect();
  }
}

function need(v: string | undefined, name: string): string {
  if (!v) throw new Error(`missing argument <${name}>`);
  return v;
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
