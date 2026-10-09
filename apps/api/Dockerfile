# LawBid API / worker image (docs/06_PRODUCTION.md §6.1: one image, two
# commands). Multi-stage: build with dev deps, run with prod deps only.
FROM node:25-alpine AS build
# `nest build` type-checks the whole API and needs more than Node's default
# ~2 GB heap (out of memory on the owner's Mac, 2026-10-07). Build stage only.
ENV NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages ./packages
RUN npm ci --workspace apps/api --include-workspace-root
COPY apps/api ./apps/api
RUN npx --workspace apps/api prisma generate \
 && npm run build --workspace apps/api \
 && cp -r apps/api/prisma/seed apps/api/dist/prisma/seed \
 && npm prune --omit=dev --workspace apps/api \
 && chmod -R a+rX apps/api/prisma apps/api/assets apps/api/dist
# ↑ The runtime runs as `app` and reads prisma/migrations (demo world) and
# assets/; a checkout with owner-only file modes gave EACCES in prod.

FROM node:25-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
# PDF fonts and the default legal texts (assets/legal/*.md) are read at runtime.
COPY --from=build /repo/apps/api/assets ./apps/api/assets
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
USER app
WORKDIR /repo/apps/api
EXPOSE 3000
# One-off prod commands (scripts/deploy/prod-run.sh): node dist/prisma/seed.js
# (its data files are copied next to it above), node dist/src/cli/*.js.
# api: node dist/src/main.js — worker: node dist/src/worker.js (ECS task
# command). nest build keeps the src/ folder (tsconfig includes prisma/ and
# scripts/), so the entry points live under dist/src.
CMD ["node", "dist/src/main.js"]
