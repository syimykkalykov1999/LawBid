# LawBid API / worker image (docs/06_PRODUCTION.md §6.1: one image, two
# commands). Multi-stage: build with dev deps, run with prod deps only.
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
# `nest build` type-checks the whole API and needs more than Node's default
# ~2 GB heap (out of memory on the owner's Mac, 2026-10-07); 4 GB ran out
# on the CI image build too (#364, 2026-10-26). Build stage only.
ENV NODE_OPTIONS=--max-old-space-size=6144
WORKDIR /repo
# .npmrc: ignore-scripts (security research #5, A1) — the build runs the
# scripts it needs by hand (prisma generate / next build).
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages ./packages
RUN npm ci --workspace apps/api --include-workspace-root
COPY apps/api ./apps/api
# Prisma 7: `prisma generate` writes the Rust-free client (TypeScript) into
# src/generated, which `nest build` compiles with the rest of the API. No
# query-engine binary any more: the image is the same on X86_64 and ARM64.
RUN npx --workspace apps/api prisma generate \
 && npm run build --workspace apps/api \
 && cp -r apps/api/prisma/seed apps/api/dist/prisma/seed \
 && npm prune --omit=dev --workspace apps/api \
 && find node_modules/onnxruntime-web/dist -type f ! -name 'ort.node.min.js' ! -name 'ort.node.min.mjs' ! -name 'ort-wasm-simd-threaded.wasm' ! -name 'ort-wasm-simd-threaded.mjs' -delete \
 && chmod -R a+rX apps/api/prisma apps/api/assets apps/api/dist
# ↑ F2 ranker: onnxruntime-web ships browser bundles and WebGPU/JSEP
# builds (145 MB); Node loads only ort.node.min.{js,mjs} and the SIMD
# WebAssembly build (18 MB left; checked 25.11 on node:alpine).
# ↑ The runtime runs as `app` and reads prisma/migrations (demo world) and
# assets/; a checkout with owner-only file modes gave EACCES in prod.

FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runtime
ENV NODE_ENV=production
# libuv's thread pool (default 4) runs scrypt, file system and DNS work.
# 8 = twice the default: password hashing is capped at 4 at a time in the app
# (security.password_hash_concurrency), so 4 threads stay free for fs / dns.
# Must be set before the process starts. Override per task in the ECS
# task definition if the vCPU count changes (about 4 x vCPU, 16 at most).
ENV UV_THREADPOOL_SIZE=8
RUN addgroup -S app && adduser -S app -G app
# Frame-by-frame video moderation (src/modules/media-moderation/video-frames.ts)
# grabs single frames over HTTPS with ffmpeg. Off by default in two ways: the
# binary is added only with `--build-arg WITH_FFMPEG=1` (the daily Trivy scan
# and the deploy scan must be run on that image first), and the feature itself
# is the admin setting `moderation.video.frames_enabled`. Without the binary
# the cover check stays as it is.
# Owner row 146: the same binary makes the AAC/M4A copy of a browser
# (WebM/Opus) voice note for the iPhone (src/modules/files/processing/
# voice-transcode.ts, admin switch `media.voice_transcode_enabled`). Without
# it the note stays WebM only (alert `voice_transcode_unavailable`).
ARG WITH_FFMPEG=0
RUN if [ "$WITH_FFMPEG" = "1" ]; then apk add --no-cache ffmpeg; fi
# ASVS 5.0 V12.3.2 (STAGE2_SECURITY #14): the RDS global CA bundle, so the
# API, worker and migrate task verify the database certificate
# (sslmode=verify-full, src/prisma/pg-adapter.ts RDS_CA_BUNDLE). The same
# pinned download as infra/pgbouncer/Dockerfile: a tampered file fails the
# build; when AWS publishes a new bundle the build stops here — check the
# new file at https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
# and pass --build-arg RDS_CA_SHA256=<its sha256> (or update both defaults).
ARG RDS_CA_SHA256=90a6f1a7978a1b1b096dca6c57511ca48d3b8cf052f8e704baf358f34ea2f21b
RUN wget -q -O /etc/ssl/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
 && echo "${RDS_CA_SHA256}  /etc/ssl/rds-global-bundle.pem" | sha256sum -c - \
 && test "$(grep -c 'BEGIN CERTIFICATE' /etc/ssl/rds-global-bundle.pem)" -ge 50 \
 && chmod 0644 /etc/ssl/rds-global-bundle.pem
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
# Prisma 7 CLI configuration (schema, DATABASE_URL): the migrate task runs
# `npx prisma migrate deploy` in this image.
COPY --from=build /repo/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
# PDF fonts and the default legal texts (assets/legal/*.md) are read at runtime.
COPY --from=build /repo/apps/api/assets ./apps/api/assets
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
# Programmatic SEO: the page library shared with the GitHub workflow
# (scripts/seo/lib + data), loaded as ES modules by the `seo.generate` job.
COPY scripts/seo/lib ./scripts/seo/lib
COPY scripts/seo/data ./scripts/seo/data
# Stage 2 SRE (Б4): the public status page; the worker copies it to the R2
# backup (status/index.html) next to status.json (public-status.service.ts).
COPY apps/status-page/index.html ./apps/status-page/index.html
# readonlyRootFilesystem on ECS: /tmp is a task volume. Declaring it as a
# VOLUME makes Fargate/Docker seed the mount from the image (mode 1777),
# so the `app` user can write the worker heartbeat and sharp/pdf temp files.
# Without this the empty mount is root-owned 755 and the worker's health
# check fails (prod deploy 2026-10-24).
VOLUME ["/tmp"]
USER app
WORKDIR /repo/apps/api
EXPOSE 3000
# One-off prod commands (scripts/deploy/prod-run.sh): node dist/prisma/seed.js
# (its data files are copied next to it above), node dist/src/cli/*.js.
# api: node dist/src/main.js — worker: node dist/src/worker.js (ECS task
# command). nest build keeps the src/ folder (tsconfig includes prisma/ and
# scripts/), so the entry points live under dist/src.
CMD ["node", "dist/src/main.js"]
