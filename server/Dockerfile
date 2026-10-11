# Build from the repository root:  docker build -f server/Dockerfile -t pinnacle-api .
FROM node:22-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci -w @pinnacle/server --include-workspace-root=false
COPY server server
RUN npm run build -w @pinnacle/server && npm prune --omit=dev -w @pinnacle/server

FROM node:22-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/server/dist ./dist
COPY --from=build /repo/server/migrations ./migrations
COPY --from=build /repo/server/package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
