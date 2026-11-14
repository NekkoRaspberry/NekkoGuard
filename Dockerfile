# syntax=docker/dockerfile:1.7
#
# NekkoGuard frontend — multi-stage build (ARM64 + AMD64).
#
#   deps     install npm dependencies from the lockfile (cached layer)
#   dev      Vite dev server with hot reload            (docker compose --profile dev)
#   build    type-check + production bundle → /app/dist
#   runtime  unprivileged nginx serving the bundle and proxying the backend  (default)

ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.28-alpine

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS dev
WORKDIR /app
ENV NODE_ENV=development \
    npm_config_update_notifier=false
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
FROM deps AS build
# Build-time overrides. Leave empty for the standard same-origin deployment.
ARG VITE_API_BASE_URL=""
ARG VITE_WS_URL=""
ARG VITE_BACKEND_PUBLIC_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_WS_URL=${VITE_WS_URL} \
    VITE_BACKEND_PUBLIC_URL=${VITE_BACKEND_PUBLIC_URL}
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
FROM ${NGINX_IMAGE} AS runtime

# Rendered with envsubst at container start (official nginx entrypoint).
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/spa-headers.inc.template /etc/nginx/templates/spa-headers.inc.template
COPY --from=build /app/dist /usr/share/nginx/html

# Where nginx forwards /api, /accounts, /users, /static and /ws (Docker service name).
ENV BACKEND_URL=http://django:8000 \
    CSP_CONNECT_SRC="'self'"

# The image already runs as the non-root "nginx" user (uid 101) on port 8080.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
