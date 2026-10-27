# LawBid admin (Next.js, docs/06 §2.1) — standalone server image for the
# `admin` ECS service. Built from the repository root:
#   docker build -f apps/admin/Dockerfile -t lawbid-admin .
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
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

FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS runtime
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
CMD ["node", "apps/admin/server.js"]
