#!/usr/bin/env python3
"""EXPLAIN (ANALYZE, BUFFERS) of the hot read paths on the seeded 10M database.

  explain_10m.py <db> [out.json]      (Postgres container: $PG_CONTAINER, default lawbid-lt-postgres-1)

Every query is the access pattern of an endpoint, cursor-paged like the app
(docs/perf/PAGINATION_AND_PARTITION_AUDIT_2026-11-02.md): the newest page of a
chat, of the notifications of one person, of the feed, the unread badge, the
name lookup of the people search. The ids are sampled from the data itself.

A query FAILS when its plan reads a big table in sequence (Seq Scan on users,
posts, messages, notifications), takes longer than its limit, or reads more
than MAX_READ_BLOCKS blocks from disk (cold cache = a page that would hurt on
RDS). Exit code 0 = all passed, 1 = at least one failed, 2 = no data, 3 = a query
or psql failed (the script is broken, not the database).
"""
import json
import os
import subprocess
import sys

BIG = ("users", "posts", "messages", "notifications")
MAX_READ_BLOCKS = 5000  # 40 MB from disk for one page request


def judge(plan, limit_ms, big=BIG):
    """plan: the root `Plan` node of EXPLAIN (FORMAT JSON) with Execution Time;
    big: names of the big tables AND of their partitions.
    Returns the list of problems (empty = pass)."""
    problems, stack = [], [plan["Plan"]]
    reads = 0
    while stack:
        node = stack.pop()
        stack.extend(node.get("Plans", []))
        reads += node.get("Shared Read Blocks", 0) if "Plans" not in node else 0  # leaves only: parents repeat them
        if node.get("Node Type") == "Seq Scan" and node.get("Relation Name") in big:
            problems.append("Seq Scan on " + node["Relation Name"])
    took = plan.get("Execution Time", 0)
    if took > limit_ms:
        problems.append("%.1f ms > limit %d ms" % (took, limit_ms))
    if reads > MAX_READ_BLOCKS:
        problems.append("%d blocks read from disk > %d" % (reads, MAX_READ_BLOCKS))
    return problems


QUERIES = [
    # (name, limit ms, sql with {conv} {user} {word})
    ("messages: newest page of a chat", 50,
     "SELECT * FROM messages WHERE conversation_id = '{conv}' AND deleted_at IS NULL "
     "ORDER BY created_at DESC, id DESC LIMIT 50"),
    ("messages: next page (cursor)", 50,
     "SELECT * FROM messages WHERE conversation_id = '{conv}' AND deleted_at IS NULL "
     "AND (created_at, id) < (now() - interval '30 days', 'ffffffff-ffff-4fff-bfff-ffffffffffff') "
     "ORDER BY created_at DESC, id DESC LIMIT 50"),
    ("notifications: newest page of one person", 50,
     "SELECT * FROM notifications WHERE user_id = '{user}' ORDER BY created_at DESC LIMIT 30"),
    ("notifications: unread badge", 50,
     "SELECT count(*) FROM (SELECT 1 FROM notifications WHERE user_id = '{user}' "
     "AND read_at IS NULL LIMIT 100) s"),
    ("feed: newest published posts", 100,
     "SELECT * FROM posts WHERE status = 'published' AND deleted_at IS NULL "
     "ORDER BY created_at DESC, id DESC LIMIT 20"),
    ("feed: next page (cursor)", 100,
     "SELECT * FROM posts WHERE status = 'published' AND deleted_at IS NULL "
     "AND (created_at, id) < (now() - interval '3 days', 'ffffffff-ffff-4fff-bfff-ffffffffffff') "
     "ORDER BY created_at DESC, id DESC LIMIT 20"),
    ("posts of one author", 50,
     "SELECT * FROM posts WHERE author_id = '{user}' AND deleted_at IS NULL "
     "ORDER BY created_at DESC LIMIT 20"),
    ("people search: name contains a common word", 300,
     "SELECT id FROM (SELECT id FROM users WHERE full_name_lower IS NOT NULL AND role = 'attorney' "
     "AND full_name_lower LIKE '%{word}%' LIMIT 20000) c LIMIT 1000"),
    ("people search: name contains a rare word", 100,
     "SELECT id FROM (SELECT id FROM users WHERE full_name_lower IS NOT NULL AND role = 'client' "
     "AND full_name_lower LIKE '%{rare}%' LIMIT 20000) c LIMIT 1000"),
]


def psql(container, db, sql):
    # PSQL_DIRECT=1: psql from PATH (PG* variables) instead of the container; for a dry run on any Postgres
    cmd = (["psql"] if os.environ.get("PSQL_DIRECT") else ["docker", "exec", container, "psql", "-U", "root"])
    r = subprocess.run(cmd + ["-d", db, "-tAq", "-c", sql], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()


def big_tables(container, db):
    """The big tables and all their partitions (whatever the partitions are named)."""
    names = psql(container, db,
                 "SELECT c.relname FROM pg_class c WHERE c.relname IN ('users','posts','messages','notifications') "
                 "UNION SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid "
                 "JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname IN ('users','posts','messages','notifications')")
    return set(names.split()) | set(BIG)


def sample(container, db):
    """Ids from the data itself: the biggest of the chats / people that a
    block sample (TABLESAMPLE) happens to hit - typical data, not the worst case.
    TABLESAMPLE reads a few blocks of a 100M table; a small database may give
    no row, then the first rows do."""
    def pick(sql_sample, sql_plain):
        return psql(container, db, sql_sample) or psql(container, db, sql_plain)
    conv = pick("SELECT conversation_id FROM messages TABLESAMPLE SYSTEM (0.01) GROUP BY 1 ORDER BY count(*) DESC LIMIT 1",
                "SELECT conversation_id FROM messages LIMIT 1")
    user = pick("SELECT user_id FROM notifications TABLESAMPLE SYSTEM (0.01) GROUP BY 1 ORDER BY count(*) DESC LIMIT 1",
                "SELECT user_id FROM notifications LIMIT 1")
    rare = pick("SELECT lower(split_part(last_name, ' ', 1)) FROM users TABLESAMPLE SYSTEM (0.001) "
                "WHERE last_name IS NOT NULL AND length(last_name) > 5 LIMIT 1",
                "SELECT lower(split_part(last_name, ' ', 1)) FROM users WHERE length(last_name) > 5 LIMIT 1")
    if not (conv and user):
        return None
    rare = "".join(ch for ch in (rare or "") if ch.isalnum() and ch.isascii()).lower()  # goes into a LIKE
    return {"conv": conv, "user": user, "word": "will", "rare": rare if len(rare) > 4 else "kalykov"}


def main(argv):
    db = argv[1]
    out = argv[2] if len(argv) > 2 else None
    container = os.environ.get("PG_CONTAINER", "lawbid-lt-postgres-1")
    try:
        big = big_tables(container, db)
        ids = sample(container, db)
    except RuntimeError as e:
        print("psql failed: " + str(e))
        return 3
    if not ids:
        print("no data to sample (messages / notifications empty?)")
        return 2
    results, failed, broken = [], 0, False
    for name, limit, sql in QUERIES:
        q = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql.format(**ids)
        try:
            plan = json.loads(psql(container, db, q))[0]
        except (RuntimeError, ValueError) as e:  # keep the other queries' results
            print("ERR  %s: %s" % (name, e))
            results.append({"query": name, "error": str(e)})
            broken = True
            continue
        problems = judge(plan, limit, big)
        failed += bool(problems)
        results.append({"query": name, "ms": round(plan.get("Execution Time", 0), 1), "limit_ms": limit,
                        "problems": problems})
        print("%-4s %7.1f ms  (limit %d)  %s%s" % ("FAIL" if problems else "ok", plan.get("Execution Time", 0),
                                                  limit, name, "  <- " + "; ".join(problems) if problems else ""))
    if out:
        with open(out, "w") as f:
            json.dump({"ids": ids, "results": results}, f, indent=1)
        with open(out + ".big", "w") as f:  # for check-10m.sh: names of the big tables and partitions
            f.write("\n".join(sorted(big)) + "\n")
    return 3 if broken else (1 if failed else 0)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
