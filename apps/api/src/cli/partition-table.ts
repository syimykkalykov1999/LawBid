import {
  PARTITION_TABLES,
  PartitionRunner,
  specOf,
} from '../partitioning/partition-runner';
import { prismaSql } from '../partitioning/sql';

// `node dist/src/cli/partition-table.js <command> <table> [--yes]`
// Online conversion of ONE big table to monthly partitions
// (docs/runbooks/table-partitioning.md). The default is a DRY RUN: it only
// reads and prints the plan. Commands:
//   plan <table>        dry run: checks, size, months, steps (no writes)
//   start <table> --yes queue the conversion (then `tick` or the worker job)
//   tick                do one bounded round of work for every queued table
//   status <table>      phase, progress, error
//   pause|resume <table>
//   abort <table>       before the swap: drop the copy, old table untouched
//   undo <table> --yes  after the swap: swap the names back (cheap)
//   finalize <table> --yes   drop the old copy (after 7 days; --force sooner)
// Needs PARTITION_DATABASE_URL: a role that owns the table (NOT lawbid_app).
const [cmd, table] = process.argv.slice(2);
const yes = process.argv.includes('--yes');
const force = process.argv.includes('--force');

async function main(): Promise<void> {
  const url = process.env.PARTITION_DATABASE_URL;
  if (!url) throw new Error('PARTITION_DATABASE_URL is not set');
  const db = prismaSql(url);
  const run = new PartitionRunner(db);
  try {
    if (cmd === 'tick') {
      console.log(JSON.stringify(await run.tick()));
      return;
    }
    const spec = table ? specOf(table) : undefined;
    if (!spec) {
      throw new Error(
        `table must be one of: ${PARTITION_TABLES.map((s) => s.table).join(', ')}`,
      );
    }
    const needYes = ['start', 'undo', 'finalize'].includes(cmd);
    if (needYes && !yes) {
      console.log('DRY RUN (add --yes to do it). Plan:');
      console.log(JSON.stringify(await run.plan(spec), null, 2));
      return;
    }
    switch (cmd) {
      case 'plan':
        console.log(JSON.stringify(await run.plan(spec), null, 2));
        break;
      case 'start':
        console.log(JSON.stringify(await run.start(spec, 'cli')));
        break;
      case 'status':
        console.log(JSON.stringify(await run.job(spec.table), null, 2));
        break;
      case 'pause':
        await run.pause(spec.table, true);
        break;
      case 'resume':
        await run.pause(spec.table, false);
        break;
      case 'abort':
        await run.abort(spec);
        break;
      case 'undo':
        await run.undo(spec);
        break;
      case 'finalize':
        await run.finalize(spec, force);
        break;
      default:
        throw new Error(
          'command: plan|start|tick|status|pause|resume|abort|undo|finalize',
        );
    }
  } finally {
    await db.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
