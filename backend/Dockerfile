# Build context is the repository root (see docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --include-workspace-root=false
COPY prisma prisma
COPY backend backend
RUN cd backend && npx prisma generate && npm run build

FROM node:22-alpine
RUN apk add --no-cache postgresql16-client tini
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --include-workspace-root=false --omit=dev && npm cache clean --force
COPY prisma prisma
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/backend/dist backend/dist
# Source is only needed for `npx prisma db seed` (demo data) inside the container.
COPY backend/src backend/src
COPY backend/tsconfig.json backend/
RUN mkdir -p /app/uploads /app/backups && chown -R node:node /app/uploads /app/backups
USER node
WORKDIR /app/backend
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:5000/api/v1/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
# Apply pending migrations, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
