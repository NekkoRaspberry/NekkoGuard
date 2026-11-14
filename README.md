# NekkoGuard-FE

Web frontend for **NekkoGuard** — React 19 + TypeScript + Vite, served by an unprivileged
nginx container that also reverse-proxies the Django backend (same origin, no CORS).

## Scope

The frontend reflects what the backend implements today (user accounts only):

| Page | Route | Backend |
|---|---|---|
| Sign in | `/login` | `POST /api/auth-token/` (DRF token) |
| Overview | `/` | `GET /api/users/me/`, WebSocket `ping` → `pong!` heartbeat |
| Profile | `/account/profile` | `GET /api/users/me/`, `PATCH /api/users/{pk}/` (`name`) |
| Security | `/account/security` | Links to the server's allauth pages (password, 2FA, emails) |

Sign-up, password reset, email verification and 2FA stay on the backend's own
(allauth) pages; nginx proxies `/accounts/` so they work under the same address.

## Architecture

```
src/
├── app/          App, router (lazy routes), routes, React Query client
├── api/          fetch client (token auth, timeouts, DRF error parsing), endpoints, DTO types
├── features/     auth/ · account/ · overview/ · system/ (API health + WebSocket heartbeat)
├── components/   design-system primitives (Button, TextField, Card, StatusPill, Toast, …)
├── layout/       AppShell, Sidebar, TopBar, PageHeader, EntranceLayout
├── styles/       tokens.css (design tokens from the look spec), base.css
├── hooks/, lib/  small shared helpers
└── config/env.ts centralised runtime config
```

- **Auth:** DRF token stored in `sessionStorage` (or `localStorage` with "Keep me signed in").
  Requests send `credentials: 'omit'`, so a Django session cookie can never switch DRF into
  CSRF-enforcing session auth. An invalid token anywhere signs the user out.
- **Styling:** CSS Modules + CSS custom properties. Fonts (Inter, JetBrains Mono) are bundled — no CDN.

## Requirements

Docker + Docker Compose only. Node.js is **not** needed on the host — everything runs in containers.
The backend stack must be running first (it creates the `nekkoguard_default` network):

```bash
cd ../nekkoguard_BE && docker compose -f docker-compose.local.yml up -d
```

## Run (production build)

```bash
docker compose up -d --build        # build + start   → http://<PI_IP>:8080
docker compose logs -f frontend     # logs
docker compose down                 # stop
```

Multi-stage image: `deps` → `build` (type-check + bundle) → `runtime` (nginx-unprivileged, uid 101, port 8080).
nginx serves the SPA and proxies `/api/`, `/accounts/`, `/users/`, `/static/` and `/ws/` to `BACKEND_URL`.

## Run (development, hot reload)

```bash
docker compose --profile dev up frontend-dev     # → http://<PI_IP>:5173
```

Source is bind-mounted; `node_modules` lives in the Docker volume `nekkoguard_fe_node_modules`
(keeps ~150 MB of churn off the project folder). After changing `package.json`:

```bash
docker compose --profile dev run --rm frontend-dev npm install
```

## Checks

```bash
docker compose --profile dev run --rm frontend-dev npm run typecheck
docker compose --profile dev run --rm frontend-dev npm run lint
docker compose --profile dev run --rm frontend-dev npm run build
```

## Configuration

Copy `.env.example` to `.env` (git-ignored). All values are optional.

| Variable | Default | Used by |
|---|---|---|
| `BACKEND_NETWORK` | `nekkoguard_default` | compose — backend Docker network |
| `BACKEND_URL` | `http://django:8000` | nginx / Vite proxy target |
| `FRONTEND_PORT` | `8080` | host port (production) |
| `FRONTEND_DEV_PORT` | `5173` | host port (dev) |
| `VITE_ALLOWED_HOSTS` | — | extra host names for the Vite dev server |
| `VITE_API_BASE_URL`, `VITE_WS_URL`, `VITE_BACKEND_PUBLIC_URL` | same origin | build args, only for non-proxied setups |

### Accessing from another device on the LAN

Django only answers for host names in `DJANGO_ALLOWED_HOSTS`
(`nekkoguard_BE/.envs/.local/.django`). Add the name or address you browse to
(e.g. `<PI_IP>`) and restart the backend's django container, otherwise API calls return 400.

## Editor note

`node_modules` is inside a Docker volume, so VS Code may show "cannot find module" / JSX
errors. They do not affect the build (`npm run typecheck` runs in the container). To get
editor IntelliSense, install dependencies into the project folder once instead
(`docker run --rm -u 1000:1000 -v "$PWD":/app -w /app node:24-alpine npm ci`) — at the cost
of ~150 MB written to the SD card.
