#!/usr/bin/env python3
"""Runs a (scaled) repo load generator with parallel workers.

  par_seed.py <db> <file.sql> [workers=8]

* psql meta lines (\\timing) dropped, SET synchronous_commit=off applied to
  every session (PGOPTIONS).
* TEMP tables become UNLOGGED tables (shared by the parallel sessions) and are
  dropped at the end of the file.
* Big INSERTs (>= 500 000 rows from generate_series / nums, the 20-messages-per-
  chat insert) are split by residue (g % K = i) into K statements run at the
  same time. Residue split keeps rows with the same unique key (they come from
  g values equal modulo the population, which K divides) in one worker, so the
  ON CONFLICT DO NOTHING inserts never deadlock.
* The audit-log hash-chain trigger (2 updates of ONE row per inserted row,
  quadratic inside one big transaction) is disabled for the seed insert only:
  seeded rows are "pre-chain" history with NULL seq/hash.
"""
import os, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

db, path = sys.argv[1], sys.argv[2]
K = int(sys.argv[3]) if len(sys.argv) > 3 else 8
PG = 'lawbid-lt-postgres-1'
BIG = 500000

src = '\n'.join(l for l in open(path).read().splitlines() if not l.lstrip().startswith(('\\', '--')))
stmts = [s.strip() for s in re.split(r';\s*\n', src) if s.strip() and not re.fullmatch(r'(--[^\n]*\n?)+', s.strip() + '\n')]
temps = []

def run(sql):
    t = time.time()
    p = subprocess.run(['docker', 'exec', '-i', '-e', 'PGOPTIONS=-c synchronous_commit=off -c statement_timeout=0',
                        PG, 'psql', '-U', 'root', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-X'],
                       input=sql + ';\n', text=True, capture_output=True)
    if p.returncode != 0:
        raise SystemExit(f'FAILED ({p.returncode}): {sql[:300]}\n{p.stderr}')
    return time.time() - t, p.stdout

def chunks(s):
    m = re.search(r'generate_series\(1,(\d+)\) g\b', s)
    if s.upper().startswith('INSERT') and m and int(m.group(1)) >= BIG:
        n = m.group(1)
        return [s.replace(m.group(0), f'(SELECT x AS g FROM generate_series(1,{n}) x WHERE x % {K} = {i}) g', 1) for i in range(K)]
    m = re.search(r'FROM nums WHERE g <= (\d+)', s)
    if m and int(m.group(1)) >= BIG:
        return [s.replace(m.group(0), m.group(0) + f' AND g % {K} = {i}', 1) for i in range(K)]
    if s.upper().startswith('INSERT INTO MESSAGES') and 'generate_series(1,20) k' in s:
        return [s + f' WHERE cv.rn % {K} = {i}' for i in range(K)]
    return None

t0 = time.time()
for s in stmts:
    m = re.match(r'CREATE TEMP TABLE (\w+)', s)
    if m:
        s = s.replace('CREATE TEMP TABLE', 'CREATE UNLOGGED TABLE', 1)
        temps.append(m.group(1))
        run(f'DROP TABLE IF EXISTS {m.group(1)}')
    if s.upper().startswith('SET SYNCHRONOUS_COMMIT'):
        continue
    audit = s.upper().startswith('INSERT INTO AUDIT_LOG')
    if audit:
        run('ALTER TABLE audit_log DISABLE TRIGGER audit_log_chain_trg')
    parts = chunks(s)
    label = re.sub(r'\s+', ' ', s)[:70]
    if parts:
        with ThreadPoolExecutor(K) as ex:
            ts = list(ex.map(lambda q: run(q)[0], parts))
        print(f'{max(ts):7.1f}s  x{K}  {label}', flush=True)
    else:
        dt, out = run(s)
        print(f'{dt:7.1f}s      {label}', flush=True)
        if s.upper().startswith('SELECT') and out.strip():
            print(out, flush=True)
    if audit:
        run('ALTER TABLE audit_log ENABLE TRIGGER audit_log_chain_trg')
for t in temps:
    run(f'DROP TABLE IF EXISTS {t}')
print(f'== {path}: {time.time() - t0:.0f} s', flush=True)
