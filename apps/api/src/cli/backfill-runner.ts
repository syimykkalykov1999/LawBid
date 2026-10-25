import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { unwrapKmsWrappedKeys } from '../common/secrets/kms-env';
import {
  OPS_KEYS,
  parseJson,
  type CapacityReading,
} from '../common/ops/ops.constants';
import {
  dbProbes,
  HealthBackfillGuard,
} from '../common/backfill/backfill.guard';
import { runBackfill } from '../common/backfill/backfill.runner';
import { BACKFILLS, findBackfill } from '../common/backfill/backfill.registry';
import { PgBackfillStore } from '../common/backfill/backfill.store';

// `node dist/src/cli/backfill-runner.js <command>` (after `nest build`), as a
// one-off task: scripts/deploy/prod-run.sh node dist/src/cli/backfill-runner.js <name>
//   list                     every registered backfill and its saved state
//   run <name>               run or continue (alias: just <name>)
//     --batch=N              keys per batch (default: the definition's, else 1000)
//     --rps=N                max rows per second (default 2000)
//     --restart              forget the cursor, walk everything again
//   pause|resume|abort <name>   same buttons as the admin «Масштаб» card
// Safe to stop (Ctrl-C) and run again: it continues from the saved cursor.
// It rests by itself while the replica lags, the database CPU or connections
// are high, an autovacuum runs on the table, or the owner paused heavy jobs.
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main(): Promise<number> {
  await unwrapKmsWrappedKeys();
  const rest = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const known = ['list', 'run', 'pause', 'resume', 'abort'];
  const cmd = known.includes(rest[0] ?? '') ? rest[0] : 'run';
  const name = known.includes(rest[0] ?? '') ? rest[1] : rest[0];

  const db = new PrismaClient();
  const store = new PgBackfillStore(db);
  const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      })
    : null;
  try {
    if (cmd === 'list') {
      const saved = new Map((await store.list()).map((r) => [r.name, r]));
      for (const b of BACKFILLS) {
        const r = saved.get(b.name);
        console.log(
          `${b.name}\t${r ? `${r.status} ${r.processed} rows` : 'not started'}\t${b.description}`,
        );
      }
      if (!BACKFILLS.length) console.log('no backfills registered');
      return 0;
    }
    if (!name) throw new Error('give a backfill name (see: list)');
    if (cmd === 'pause' || cmd === 'resume' || cmd === 'abort') {
      const to =
        cmd === 'pause' ? 'paused' : cmd === 'resume' ? 'running' : 'aborted';
      const row = await store.setStatus(name, to);
      console.log(
        row
          ? `${name}: ${row.status}`
          : `${name}: nothing to ${cmd} (wrong state or unknown name)`,
      );
      return row ? 0 : 1;
    }
    const def = findBackfill(name);
    if (!def) throw new Error(`unknown backfill "${name}" (see: list)`);
    const ops = redis
      ? {
          capacity: async () =>
            parseJson<CapacityReading>(await redis.get(OPS_KEYS.capacity)),
          isHeavyPaused: async () =>
            (await redis.exists(OPS_KEYS.heavyPaused)) === 1,
        }
      : undefined;
    const guard = new HealthBackfillGuard(dbProbes(db, ops));
    const res = await runBackfill(def, db, store, guard, {
      batchSize: arg('batch') ? Number(arg('batch')) : undefined,
      maxRowsPerSec: arg('rps') ? Number(arg('rps')) : undefined,
      restart: process.argv.includes('--restart'),
      log: (l) => console.log(l),
    });
    console.log(JSON.stringify(res));
    return res.outcome === 'done' || res.outcome === 'aborted' ? 0 : 1;
  } finally {
    redis?.disconnect();
    await db.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
