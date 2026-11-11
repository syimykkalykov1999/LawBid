# Own servers (docs/architecture/SELF_HOSTING_INVENTORY_2026-10-28.md, row 10):
# PostgreSQL 16 with pgBackRest (MIT) from the PostgreSQL project's own Debian
# packages (PGDG) — no third-party image. Full/diff backups and the
# write-ahead log go to any S3-compatible store (our MinIO), so the database
# can be restored to any second. Proven 2026-11-10: docs/runbooks/selfhost-backups.md.
FROM postgres:16
RUN apt-get update \
 && apt-get install -y --no-install-recommends pgbackrest ca-certificates \
 && apt-get clean \
 && pgbackrest version
