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

# RDS global CA bundle (S3-7, 2026-10-25): lets PgBouncer verify the database
# (DB_TLS_MODE=verify-full). Pinned by hash so a tampered download fails the
# build; when AWS publishes a new bundle the build stops here: check the new
# file at https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
# and pass --build-arg RDS_CA_SHA256=<its sha256> (or update the default).
ARG RDS_CA_SHA256=90a6f1a7978a1b1b096dca6c57511ca48d3b8cf052f8e704baf358f34ea2f21b
RUN wget -q -O /etc/ssl/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
 && echo "${RDS_CA_SHA256}  /etc/ssl/rds-global-bundle.pem" | sha256sum -c - \
 && test "$(grep -c 'BEGIN CERTIFICATE' /etc/ssl/rds-global-bundle.pem)" -ge 50 \
 && chmod 0644 /etc/ssl/rds-global-bundle.pem

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh

# Alpine's pgbouncer package runs as the unprivileged `postgres` user.
USER postgres
EXPOSE 5432
# SIGINT = PgBouncer's "safe shutdown": let running transactions finish,
# then exit (SIGTERM would cut them off).
STOPSIGNAL SIGINT
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
