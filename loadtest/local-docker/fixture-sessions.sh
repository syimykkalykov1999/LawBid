#!/usr/bin/env bash
# Session rows for the minted k6 tokens (mint.mjs signs JWTs without a `sessions`
# row). With Redis away the API checks revocation in the `sessions` table
# (PR claude/redis-fail-fast), so a token without a row is refused (401) —
# real tokens always have one. Idempotent; run after prepare.sh.
#   fixture-sessions.sh <fixtures dir> [db=lawbid_lt]
set -euo pipefail
fx="$1"; DB="${2:-lawbid_lt}"
python3 - "$fx" <<'PY' | docker exec -i lawbid-lt-postgres-1 psql -U root -d "$DB" -v ON_ERROR_STOP=1 -qc "CREATE TEMP TABLE fx(user_id uuid, sid uuid); COPY fx FROM STDIN; INSERT INTO sessions (user_id, session_chain_id, refresh_hash, expires_at, created_at, updated_at, device_name) SELECT DISTINCT ON (sid) user_id, sid, 'lt-fixture-'||sid, now() + interval '30 days', now(), now(), 'k6 fixture' FROM fx ON CONFLICT (refresh_hash) DO NOTHING; SELECT 'k6 fixture sessions: '||count(*) FROM sessions WHERE device_name='k6 fixture';"
import json, base64, sys, os
d = sys.argv[1]; seen = set()
def emit(tok):
    if not isinstance(tok, str) or tok.count('.') != 2: return
    p = tok.split('.')[1]
    try: c = json.loads(base64.urlsafe_b64decode(p + '=' * (-len(p) % 4)))
    except Exception: return
    sid, sub = c.get('sid'), c.get('sub')
    if sid and sub and sid not in seen: seen.add(sid); print(f"{sub}\t{sid}")
def walk(x):
    if isinstance(x, dict):
        for v in x.values(): walk(v)
    elif isinstance(x, list):
        for v in x: walk(v)
    else: emit(x)
for f in ('tokens.json', 'fixtures.json'):
    p = os.path.join(d, f)
    if os.path.exists(p): walk(json.load(open(p)))
print('\\.')
PY
