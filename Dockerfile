# syntax=docker/dockerfile:1

# Pinned Node version, matching the image the dev compose file used before.
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
WORKDIR /app
# pnpm is installed globally instead of via corepack so the version is explicit
# and identical in every stage.
RUN npm i -g pnpm@10

# Dependencies are installed in their own stage so a source-only change does not
# reinstall the whole tree.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Development server: the target docker-compose.yml builds. The source is
# bind-mounted at runtime, so only node_modules comes from the image.
FROM deps AS dev
ENV CHOKIDAR_USEPOLLING=true \
    CI=true
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173"]

# Static build for production deployments.
FROM deps AS build
COPY . .
RUN pnpm build

FROM nginx:1.29-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
