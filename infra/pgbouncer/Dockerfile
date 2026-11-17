# Our own connection pooler (docs/architecture/DB_POOLER.md).
#
# Official `alpine` base (multi-arch: amd64 + arm64, pinned by digest) and
# PgBouncer built from the OFFICIAL release tarball of pgbouncer.org, pinned by
# its published sha256 (row 202, 16.11). Alpine's own package stops at 1.25.2
# (v3.24 and edge), which is still open to CVE-2026-107349 (startup "-c="
# spins a CPU core forever; we set ignore_startup_parameters, so it applies to
# us), CVE-2026-107350 and CVE-2026-107348, fixed in 1.26.1 (14.10.2026,
# https://www.pgbouncer.org/changelog.html). The build steps are Alpine's own
# APKBUILD for pgbouncer as is (aports community/pgbouncer: the same
# makedepends, `./configure --prefix=/usr --disable-debug`, and the one-line
# fix-int64-musl.patch). Only the binary is built (`make pgbouncer`): the
# 1.26 tarball makes its man pages with pandoc, which the image does not need. Supply chain: Alpine + its package signing for every
# library, pgbouncer.org + the sha256 for PgBouncer itself.
# Built and pushed to ECR (lawbid-pgbouncer) for both architectures by
# .github/workflows/build-pgbouncer.yml.
#
# Runs as the unprivileged `postgres` user, with a read-only root file system
# (everything it writes goes to /tmp, a volume in the task definition).
ARG ALPINE=alpine:3.24.4@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf
ARG PGBOUNCER_VERSION=1.26.1

FROM ${ALPINE} AS build
ARG PGBOUNCER_VERSION
ARG PGBOUNCER_SHA256=00886a2994b4844cd37110970df777772cfc42a74c400522c82fba509a3f42d9
RUN apk add --no-cache build-base c-ares-dev libevent-dev "openssl-dev>3" udns-dev pkgconf
WORKDIR /src
RUN wget -q -O pgbouncer.tar.gz "https://www.pgbouncer.org/downloads/files/${PGBOUNCER_VERSION}/pgbouncer-${PGBOUNCER_VERSION}.tar.gz" \
 && echo "${PGBOUNCER_SHA256}  pgbouncer.tar.gz" | sha256sum -c - \
 && tar xzf pgbouncer.tar.gz --strip-components=1 \
 && sed -i 's/(int64) v >= 0/(int64_t) v >= 0/' include/common/simd.h \
 && ./configure --prefix=/usr --disable-debug \
 && make -j"$(nproc)" pgbouncer \
 && ./pgbouncer --version

FROM ${ALPINE}
ARG PGBOUNCER_VERSION
# Runtime libraries of the build above (the same ones Alpine's package pulls)
# plus psql for the metric loop and openssl for the start-up certificate.
RUN apk add --no-cache c-ares libevent libssl3 udns postgresql-client openssl \
 && getent passwd postgres
COPY --from=build /src/pgbouncer /usr/bin/pgbouncer
RUN pgbouncer --version | tee /dev/stderr | grep -qx "PgBouncer ${PGBOUNCER_VERSION}"

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

# 10.11 (prod): on Fargate the task's empty /tmp volume is root-owned 0755,
# so the entrypoint's `mkdir /tmp/pgb` failed and every task exited 1. ECS
# copies a path named in VOLUME (same as the task's containerPath) with its
# owner into that volume (AWS docs, "Use bind mounts with Amazon ECS").
RUN chown postgres:postgres /tmp && chmod 0700 /tmp
VOLUME ["/tmp"]

# The unprivileged `postgres` user (created by Alpine's postgresql packages).
USER postgres
EXPOSE 5432
# SIGINT = PgBouncer's "safe shutdown": let running transactions finish,
# then exit (SIGTERM would cut them off).
STOPSIGNAL SIGINT
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
