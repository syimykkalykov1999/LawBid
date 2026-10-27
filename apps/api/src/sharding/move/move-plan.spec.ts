import { SHARDED_MODELS, familyOf } from '../shard-manifest';
import { buildMoveTables, crossFamilyEdges, shardedEdges } from './move-plan';
import {
  checksumSql,
  createGuardTriggerSql,
  selectBatchSql,
  upsertSql,
} from './move-sql';

describe('move plan', () => {
  const tables = buildMoveTables();
  const index = new Map(tables.map((t, i) => [t.model, i]));

  it('covers every sharded model exactly once', () => {
    expect(tables).toHaveLength(Object.keys(SHARDED_MODELS).length);
    expect(new Set(tables.map((t) => t.model)).size).toBe(tables.length);
  });

  it('puts every parent before its children, except late (nullable) columns', () => {
    for (const e of shardedEdges()) {
      const late = tables[index.get(e.childModel)!].late.includes(e.column);
      if (!late) {
        expect(index.get(e.parentModel)!).toBeLessThan(
          index.get(e.childModel)!,
        );
      }
    }
  });

  it('breaks the Case/Bid cycle and self references only on nullable columns', () => {
    const late = tables.filter((t) => t.late.length > 0);
    expect(late.length).toBeGreaterThan(0);
    for (const e of shardedEdges()) {
      const t = tables[index.get(e.childModel)!];
      if (t.late.includes(e.column)) expect(e.required).toBe(false);
    }
    expect(tables.find((t) => t.model === 'Message')!.late).toContain(
      'reply_to_id',
    );
  });

  it('knows the composite primary keys', () => {
    expect(tables.filter((t) => t.pk.length > 1).length).toBeGreaterThan(20);
    for (const t of tables) expect(t.pk.length).toBeGreaterThan(0);
  });

  it('cross-family edges join different families only', () => {
    const edges = crossFamilyEdges();
    expect(edges.length).toBeGreaterThan(100);
    for (const e of edges) {
      expect(familyOf(e.childModel)).not.toBe(familyOf(e.parentModel));
    }
  });
});

describe('move SQL', () => {
  const t = buildMoveTables().find((x) => x.model === 'CaseCommentLike')!;
  const msg = buildMoveTables().find((x) => x.model === 'Message')!;

  it('keyset batch uses the whole composite key and returns text rows', () => {
    const sql = selectBatchSql(t, true);
    expect(sql).toContain(`(${t.pk.map((c) => `"${c}"`).join(', ')}) >`);
    expect(sql).toContain('::text AS rows');
    expect(selectBatchSql(t, false)).not.toContain('jsonb_populate_record(');
  });

  it('first-pass upsert inserts late columns as NULL, conflicts on the key', () => {
    const cols = ['id', 'reply_to_id', 'body'];
    const sql = upsertSql(msg, cols, true);
    expect(sql).toContain('SELECT "id", NULL, "body"');
    // #358: messages are keyed by (id, conversation_id).
    expect(sql).toContain(
      'ON CONFLICT ("id", "conversation_id") DO UPDATE SET',
    );
    expect(upsertSql(msg, cols, false)).toContain('"reply_to_id", "body" FROM');
  });

  it('all-key tables upsert with DO NOTHING', () => {
    expect(upsertSql(t, t.pk, false)).toContain('DO NOTHING');
  });

  it('checksum is order independent (sum of row hashes)', () => {
    expect(checksumSql(t)).toContain(
      'sum(hashtextextended(x::text, 0)::numeric)',
    );
  });

  it('guard trigger passes the key columns', () => {
    const [drop, create] = createGuardTriggerSql(t);
    expect(drop).toContain('DROP TRIGGER IF EXISTS');
    expect(create).toContain('BEFORE INSERT OR UPDATE OR DELETE');
    expect(create).toContain('lawbid_shard_move_guard(');
  });
});
