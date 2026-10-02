# LawBid API / worker image (docs/06_PRODUCTION.md §6.1: one image, two
# commands). Multi-stage: build with dev deps, run with prod deps only.
FROM node:26-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages ./packages
RUN npm ci --workspace apps/api --include-workspace-root
COPY apps/api ./apps/api
RUN npx --workspace apps/api prisma generate \
 && npm run build --workspace apps/api \
 && npm prune --omit=dev --workspace apps/api

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
USER app
WORKDIR /repo/apps/api
EXPOSE 3000
# api: node dist/main.js — worker: node dist/worker.js (ECS task command)
CMD ["node", "dist/main.js"]
