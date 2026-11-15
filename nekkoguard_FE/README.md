# NekkoGuard — Frontend

Part of the NekkoGuard monorepo (`nekkoguard_FE/`; the backend is in `../nekkoguard_BE/`).

Web frontend for **NekkoGuard** — React 19 + TypeScript + Vite, served by an unprivileged
nginx container that also reverse-proxies the Django backend (same origin, no CORS).

## Scope

The frontend reflects what the backend implements today (user accounts and multi-tenancy):

| Page | Route | Backend |
|---|---|---|
| Sign in (+ 2FA step) | `/login`, `/login/2fa` | `/_allauth/browser/v1/auth/login`, `…/auth/2fa/authenticate` |
| Sign up | `/signup`, `/verify-email` | `…/auth/signup` (mandatory email verification) |
| Verify email (link from email) | `/verify-email/:key` | `…/auth/email/verify` |
| Forgot / reset password | `/forgot-password`, `/reset-password/:key` | `…/auth/password/request`, `…/auth/password/reset` |
| Overview | `/` | `GET /api/users/me/`, `…/account/authenticators`, WebSocket `ping` → `pong!` |
| Sites & networks | `/infrastructure` | `/api/tenants/{t}/organizations/{o}/sites/`, `…/networks/` |
| Settings → Tenant (selected Tenant) | `/settings/tenant` (+ `/organizations`, `/organizations/manage`, `/organizations/manage/appearance`, `/members`, `/activity`, `/appearance`) | `/api/tenants/{t}/` (+ `members/`, `organizations/`, `activity/`, `appearance/`) |
| Settings → Organization (selected Organization) | `/settings/organization` (+ `/members`, `/access` = Permissions, `/activity`, `/appearance`) | `/api/tenants/{t}/organizations/{o}/` (+ `members/` (add by email), `invitations/`, `overrides/`, `access/`, `activity/?ordering=`, `appearance/`) |
| Organization invitation (link from email) | `/invitations/:token` | `GET /api/invitations/{token}/`, `POST …/accept/` |
| Settings → Profile → Personal information | `/settings/profile` | `GET /api/users/me/`, `PATCH /api/users/{pk}/` (`name`) |
| Settings → Profile → Security | `/settings/profile/security` | `…/account/password/change`, `…/account/email`, `…/account/authenticators/*` (TOTP, recovery codes), `DELETE …/auth/session` |
| Settings → Profile → Connected applications | `/settings/profile/applications` | `/api/oauth/authorized-apps/` (all users), `/api/oauth/applications/` (staff), consent page `/o/authorize/` |
| Google / GitHub / LinkedIn sign-in | `/login`, `/auth/callback`, `/signup/provider` | allauth provider flow; buttons appear only for providers configured in the backend env |

Old `/account/*` URLs redirect to their Settings → Profile page. Platform administration (creating and deactivating Tenants) is not part of the web app: use Django admin.

Authentication uses **django-allauth headless** (`/_allauth/browser/v1/…`), browser client:

- Session in an **HttpOnly cookie** (never readable by JavaScript); CSRF token sent as `X-CSRFToken`.
- Login enforces **email verification** and **two-factor authentication**.
- Sign-out ends the session **on the server**; sessions also end when the browser closes.
- Sensitive changes (2FA) ask the user to **confirm their identity** ("Confirm it's you" dialog).

## Architecture

```
src/
├── app/          App, router (lazy routes), routes, React Query client
├── api/          http transport (cookies + CSRF), allauth client, DRF client, DTO types
├── features/
│   ├── auth/     AuthProvider (session state), route guards, auth pages, re-authentication
│   ├── account/  profile + security (password, emails, 2FA) cards and hooks
│   ├── overview/ overview page cards
│   ├── system/   API health + WebSocket heartbeat
│   ├── tenancy/  context (TenancyProvider, selection logic, useCan…), context bar, scope gates
│   ├── infrastructure/ sites & networks page
│   └── settings/ organization / tenant / platform management screens
├── components/   design-system primitives (Button, TextField, Card, Modal, Toast, …)
├── layout/       AppShell, Sidebar, TopBar, PageHeader, EntranceLayout
├── styles/       tokens.css (design tokens from the look spec), base.css
└── hooks/, lib/, config/
```

## Tenant & organization context

- The top bar selects **Tenant → Organization → Site → Network**. Only what the backend lists for the
  user is offered. The selection is **never in the URL**: it lives in memory and is remembered per
  user in this browser, so a refresh reopens it. Pages never carry tenant/organization ids
  (the organization managed from Settings → Tenant is passed as navigation state). Ids the user
  can no longer access are dropped, with a notice.
- Hooks: `useTenancy()`, `useCurrentTenant()`, `useCurrentOrganization()`, `useEffectivePermissions()`,
  `useCan('sites.manage')`, `useCanTenant('tenant.members.manage')`. They only hide/disable UI — the
  backend resolves and enforces every permission.
- Query keys are hierarchical (`['tenants', t, 'organizations', o, …]`, see `src/api/queryKeys.ts`):
  data of one tenant/organization is never reused for another, and switching drops the previous scope.

## Requirements

Docker + Docker Compose only — Node.js is **not** needed on the host.
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
nginx serves the SPA and proxies `/api/`, `/_allauth/`, `/admin/`, `/static/` and `/ws/` to `BACKEND_URL`.
The Django admin is reachable at `http://<PI_IP>:8080/admin/` (staff accounts, Django's own login).
allauth runs headless-only, so its old HTML pages (`/accounts/…`) no longer exist.

## Run (development, hot reload)

```bash
# once (and after package.json changes): install dependencies into ./node_modules
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD":/app -w /app node:24-alpine npm ci

docker compose --profile dev up frontend-dev     # → http://<PI_IP>:5173
```

The project folder (including `./node_modules`) is bind-mounted into the dev container, so
VS Code sees the same dependencies for IntelliSense.

## Checks

```bash
docker compose --profile dev run --rm frontend-dev npm run typecheck
docker compose --profile dev run --rm frontend-dev npm run lint
docker compose --profile dev run --rm frontend-dev npm run build
docker compose --profile dev run --rm frontend-dev npm test        # Vitest unit tests
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
| `VITE_API_BASE_URL`, `VITE_WS_URL` | same origin | build args, only for non-proxied setups |

### Accessing from another device on the LAN

Django only answers for host names in `DJANGO_ALLOWED_HOSTS`
(`nekkoguard_BE/.envs/.local/.django`, git-ignored). It must include every name or address
you browse to (e.g. `<PI_IP>`, `nekkoraspberry.local`). After editing, recreate the backend
container: `docker compose -f docker-compose.local.yml up -d --force-recreate django`.
If the Pi's address changes (DHCP), update this list — or give the Pi a DHCP reservation.
