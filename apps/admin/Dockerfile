# LawBid admin (Next.js, docs/06 §2.1) — standalone server image for the
# `admin` ECS service. Built from the repository root:
#   docker build -f apps/admin/Dockerfile -t lawbid-admin .
FROM node:26.12.0-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS build
# Same headroom as the API build: Node's default heap can run out on
# `next build`. Build stage only.
ENV NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /repo
# .npmrc: ignore-scripts (security research #5, A1) — the build runs the
# scripts it needs by hand (prisma generate / next build).
COPY package.json package-lock.json .npmrc ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/api-contract/openapi.json packages/api-contract/openapi.json
RUN npm ci --workspace apps/admin --include-workspace-root
COPY apps/admin ./apps/admin
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run generate --workspace apps/admin \
 && npm run build --workspace apps/admin

FROM node:26.12.0-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /repo/apps/admin/.next/standalone ./
COPY --from=build /repo/apps/admin/.next/static ./apps/admin/.next/static
# readonlyRootFilesystem on ECS: /tmp and the Next.js cache are task volumes.
# As VOLUMEs with `app` ownership they are seeded writable for the app user
# (an empty mount is root-owned and the admin fails its health check).
RUN mkdir -p /app/apps/admin/.next/cache && chown -R app:app /app/apps/admin/.next/cache
VOLUME ["/tmp", "/app/apps/admin/.next/cache"]
USER app
EXPOSE 3001
# ECS/Docker overwrite HOSTNAME with the task's own name at runtime, so the
# ENV above is lost and Next's standalone server binds only to
# ip-10-…ec2.internal; the health check (wget 127.0.0.1:3001) then fails and
# the circuit breaker rolls every new admin release back (prod, 2026-10-24…28).
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node apps/admin/server.js"]
