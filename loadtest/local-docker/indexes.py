#!/usr/bin/env python3
"""Deferred secondary indexes for the big seeds (profile "10M", seed.sh with
DEFER_INDEXES=1).

  indexes.py drop <db> <file>          save + drop every NON-unique index of public
  indexes.py create <db> <file> [W]    rebuild them, W at a time (default 8)

Inserting 100 M rows into tables that already carry their secondary indexes
(random-uuid b-trees that do not fit in memory) is the slow part of a 10M seed;
building each index once after the load is a sorted bulk build. Unique and
primary-key indexes stay (ON CONFLICT DO NOTHING of the generators needs them).
Load-test databases only.
"""
import json, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

PG = 'lawbid-lt-postgres-1'


def psql(db, sql, opts=''):
    p = subprocess.run(['docker', 'exec', '-i', '-e', f'PGOPTIONS=-c statement_timeout=0 {opts}', PG,
                        'psql', '-U', 'root', '-d', db, '-v', 'ON_ERROR_STOP=1', '-qtAX'],
                       input=sql, text=True, capture_output=True)
    if p.returncode != 0:
        raise SystemExit(f'FAILED: {sql[:200]}\n{p.stderr}')
    return p.stdout


def main():
    mode, db, path = sys.argv[1], sys.argv[2], sys.argv[3]
    if mode == 'drop':
        rows = psql(db, """
          SELECT json_agg(json_build_object('name', ic.relname, 'def', pg_get_indexdef(i.indexrelid)))
          FROM pg_index i
          JOIN pg_class ic ON ic.oid = i.indexrelid
          JOIN pg_class tc ON tc.oid = i.indrelid
          WHERE tc.relnamespace = 'public'::regnamespace AND tc.relkind = 'r'
            AND NOT i.indisunique AND NOT i.indisprimary
            AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
            -- partitions of a partitioned index belong to their parent
            AND NOT EXISTS (SELECT 1 FROM pg_inherits h WHERE h.inhrelid = i.indexrelid);
        """).strip()
        idx = json.loads(rows) if rows else []
        json.dump(idx, open(path, 'w'))
        psql(db, 'BEGIN;\n' + ''.join(f'DROP INDEX IF EXISTS public."{x["name"]}";\n' for x in idx) + 'COMMIT;\n')
        print(f'dropped {len(idx)} secondary indexes -> {path}', flush=True)
    elif mode == 'create':
        w = int(sys.argv[4]) if len(sys.argv) > 4 else 8
        idx = json.load(open(path))
        t0 = time.time()

        def build(x):
            t = time.time()
            psql(db, x['def'].replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ', 1) + ';',
                 '-c maintenance_work_mem=1GB -c max_parallel_maintenance_workers=2')
            return time.time() - t, x['name']

        with ThreadPoolExecutor(w) as ex:
            for dt, name in ex.map(build, idx):
                if dt > 30:
                    print(f'{dt:7.1f}s  {name}', flush=True)
        print(f'rebuilt {len(idx)} indexes in {time.time() - t0:.0f} s', flush=True)
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
