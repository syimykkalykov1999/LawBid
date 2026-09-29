# LawBid admin (Next.js, docs/06 §2.1) — standalone server image for the
# `admin` ECS service. Built from the repository root:
#   docker build -f apps/admin/Dockerfile -t lawbid-admin .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/api-contract/openapi.json packages/api-contract/openapi.json
RUN npm ci --workspace apps/admin --include-workspace-root
COPY apps/admin ./apps/admin
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run generate --workspace apps/admin \
 && npm run build --workspace apps/admin

FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /repo/apps/admin/.next/standalone ./
COPY --from=build /repo/apps/admin/.next/static ./apps/admin/.next/static
USER app
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
