import {
  PARTITION_TABLES,
  PartitionRunner,
} from '../src/partitioning/partition-runner';
import { prismaSql, type SqlDb } from '../src/partitioning/sql';

/**
 * Automation audit 2026-11-08: admin «Масштаб» showed «Авто» for the
 * monthly journals while the runner's precheck said «Пока нельзя» (missing
 * indexes, a unique index without the partition key). On the migrated
 * schema every table the runner may convert by month must pass the
 * precheck, so «Авто» can really act when the table grows. Read-only:
 * catalog queries only, nothing is converted.
 */
describe('partitioning: every monthly table is convertible', () => {
  let db: SqlDb;

  beforeAll(() => {
    db = prismaSql(process.env.DATABASE_URL ?? '');
  });
  afterAll(async () => {
    await db?.close();
  });

  it.each(PARTITION_TABLES.map((s) => [s.table, s] as const))(
    '%s passes the precheck',
    async (_table, spec) => {
      const pre = await new PartitionRunner(db).precheck(spec);
      expect(pre.reasons).toEqual([]);
      expect(pre.ok).toBe(true);
    },
  );
});
