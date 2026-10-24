# Our own connection pooler (docs/architecture/DB_POOLER.md).
#
# Official `alpine` base (multi-arch: amd64 + arm64, pinned by digest) plus
# Alpine's own `pgbouncer` package. No third-party image: the supply chain is
# Alpine + Alpine's package signing. Built and pushed to ECR (lawbid-pgbouncer)
# for both architectures by .github/workflows/build-pgbouncer.yml.
#
# Runs as the unprivileged `postgres` user, with a read-only root file system
# (everything it writes goes to /tmp, a volume in the task definition).
FROM alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f

RUN apk add --no-cache pgbouncer postgresql-client openssl \
 && getent passwd postgres \
 && pgbouncer --version

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh

# Alpine's pgbouncer package runs as the unprivileged `postgres` user.
USER postgres
EXPOSE 5432
# SIGINT = PgBouncer's "safe shutdown": let running transactions finish,
# then exit (SIGTERM would cut them off).
STOPSIGNAL SIGINT
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
