# Build from the repository root:  docker build -f web/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t pinnacle-web .
FROM node:22-slim AS build
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /repo
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci -w @pinnacle/web --include-workspace-root=false
COPY web web
RUN npm run build -w @pinnacle/web

FROM nginx:1.27-alpine
COPY --from=build /repo/web/dist /usr/share/nginx/html
EXPOSE 80
