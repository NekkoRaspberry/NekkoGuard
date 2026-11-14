# NekkoGuard — Backend Specification

**Scope:** Django project at `nekkoguard/` (repository subfolder). Reflects the code on branch `dev` as of commit `1229f3d`.

---

## 1. Project Overview

- **Purpose (as implemented):** The backend is a Cookiecutter Django scaffold (`pyproject.toml` version `0.1.0`, description "Nekko Guard will keep guarding"). Its only implemented domain is **user account management**: email-based registration and login, mandatory email verification, MFA support, a user profile page, and a minimal REST API over the current user.
- **Intended purpose (not implemented):** `Specifications/NekkoGuardLogic.txt` (outside the backend) describes a self-hosted infrastructure monitoring, network discovery and security platform with multi-tenancy. **None of that domain exists in code** — there are no models, apps, endpoints or tasks for devices, networks, scans, vulnerabilities, certificates, containers, Pi-hole, agents, alerts or organizations.
- **Current responsibilities:**
  - Custom user model with email as the login identifier.
  - Authentication flows via `django-allauth` (server-rendered HTML).
  - REST API (DRF) exposing the authenticated user's own record.
  - Token issuance for API clients.
  - OpenAPI schema and Swagger UI (admin-only).
  - Celery worker/beat infrastructure (one demo task).
  - Minimal ASGI WebSocket echo endpoint (`ping` → `pong!`).

---

## 2. Technology Stack

| Area | Technology (pinned version) |
|---|---|
| Language | Python `3.14` (`.python-version`, `requires-python = "==3.14.*"`) |
| Framework | Django `6.0.10` |
| REST API | djangorestframework `3.18.3`, `rest_framework.authtoken` |
| API schema | drf-spectacular `0.30.0` (OpenAPI 3, Swagger UI) |
| Auth | django-allauth[mfa] `65.21.1` (account, mfa, socialaccount) |
| Password hashing | argon2-cffi `25.1.0` (Argon2 primary hasher) |
| Async tasks | Celery `5.7.0`, django-celery-beat `2.9.0`, Flower `2.2.0` |
| Broker / result backend / cache | Redis `7.2` image; redis-py `8.1.0`, hiredis, django-redis `7.0.0` |
| Database | PostgreSQL `18` (`docker.io/postgres:18`), psycopg[c] `3.3.8` |
| Config | django-environ `0.14.0` |
| Web server | Gunicorn `26.2.0` + `uvicorn-worker` (ASGI) in production; `uvicorn --reload` in development |
| Static files | WhiteNoise `6.12.0` |
| Media files (prod) | Nginx (served from shared volume) |
| Reverse proxy / TLS (prod) | Traefik with Let's Encrypt (HTTP challenge) |
| Email | SMTP (Mailpit) in dev/local; Mailgun via django-anymail `15.2` in production |
| Error monitoring | sentry-sdk `2.74.0` (Django, Celery, Redis, Logging integrations) — production only |
| Templates/forms | django-crispy-forms + crispy-bootstrap5 |
| Other | django-cors-headers, django-model-utils (installed, unused in code), python-slugify (unused), Pillow |
| Package manager | `uv` (`uv.lock`) |
| Dev tools | pytest, pytest-django, factory-boy, coverage, mypy + django-stubs, ruff, djlint, pre-commit, django-debug-toolbar, django-extensions, Sphinx |

---

## 3. Backend Architecture

### 3.1 Overall

Monolithic Django project, ASGI-served, with separate Celery worker/beat/Flower processes sharing the same codebase and settings. Server-rendered HTML (allauth + Django templates) and a DRF JSON API coexist in the same process.

```
nekkoguard/                     # project root (manage.py, pyproject.toml)
├── config/                     # project configuration
│   ├── settings/{base,local,production,test}.py
│   ├── urls.py                 # root URLconf
│   ├── api_router.py           # DRF router (namespace "api")
│   ├── asgi.py                 # HTTP → Django, websocket → config/websocket.py
│   ├── websocket.py            # raw ASGI WebSocket handler
│   ├── wsgi.py
│   └── celery_app.py           # Celery app "nekkoguard"
├── nekkoguard/                 # APPS_DIR
│   ├── users/                  # the only local Django app
│   ├── contrib/sites/          # migration overrides for django.contrib.sites
│   ├── templates/, static/     # HTML templates, CSS/JS
│   └── conftest.py             # pytest fixtures
├── compose/                    # Dockerfiles and start scripts per environment
├── docker-compose.{development,local,production,docs}.yml
├── locale/                     # en_US, fr_FR, pt_BR .po files
└── docs/                       # Sphinx docs
```

### 3.2 Django apps

| App | Responsibility |
|---|---|
| `nekkoguard.users` | Custom `User` model and manager, allauth adapters/forms, admin registration, HTML profile views, DRF `UserViewSet`/`UserSerializer`, demo Celery task, template context processor. |
| `nekkoguard.contrib.sites` | Not an installed app; provides `MIGRATION_MODULES["sites"]`. Migration `0003` sets `Site(id=SITE_ID=1)` to domain `nekkoguard.com`, name `NekkoGuard`, and resyncs `django_site_id_seq`. |
| Third-party installed | `allauth`, `allauth.account`, `allauth.mfa`, `allauth.socialaccount`, `django_celery_beat`, `rest_framework`, `rest_framework.authtoken`, `corsheaders`, `drf_spectacular`, `crispy_forms`, `crispy_bootstrap5`. Production adds `anymail`; local adds `whitenoise.runserver_nostatic`, `debug_toolbar`, `django_extensions`. |

### 3.3 Component relationships

- `config.urls` → `nekkoguard.users.urls` (HTML), `allauth.urls`, `config.api_router` (DRF), drf-spectacular views, `obtain_auth_token`.
- `config.api_router` → `users.api.views.UserViewSet`. Router is `DefaultRouter` (browsable API root) when `DEBUG`, otherwise `SimpleRouter`.
- allauth → `users.adapters.AccountAdapter` / `SocialAccountAdapter`, `users.forms.UserSignupForm` / `UserSocialSignupForm`.
- `users.admin` → optionally wraps `admin.site.login` with allauth's `secure_admin_login` when `DJANGO_ADMIN_FORCE_ALLAUTH=True`.
- `config.celery_app` → reads `CELERY_*` Django settings, autodiscovers `tasks.py` in installed apps, configures logging from `settings.LOGGING`.
- `config.asgi` → routes `http` scope to Django, `websocket` scope to `config.websocket.websocket_application`; any other scope raises `NotImplementedError`.

---

## 4. Database Structure

Engine: PostgreSQL. `DEFAULT_AUTO_FIELD = BigAutoField`. `ATOMIC_REQUESTS = True` (every HTTP request runs in a transaction).

### 4.1 Project-defined models

**`users.User`** (`AUTH_USER_MODEL = "users.User"`, extends `AbstractUser`)

| Field | Type | Notes |
|---|---|---|
| `id` | BigAutoField | PK |
| `email` | EmailField(254) | **unique**; `USERNAME_FIELD` |
| `name` | CharField(255) | blank allowed; replaces first/last name |
| `password` | CharField(128) | hashed (Argon2 default) |
| `is_active`, `is_staff`, `is_superuser` | Boolean | standard |
| `last_login`, `date_joined` | DateTime | standard |
| `groups` | M2M → `auth.Group` | standard |
| `user_permissions` | M2M → `auth.Permission` | standard |

- Removed fields: `username`, `first_name`, `last_name` (set to `None`).
- `REQUIRED_FIELDS = []`.
- Manager `UserManager`: `create_user` / `create_superuser` take `email` (required, normalized); superuser must have `is_staff=True` and `is_superuser=True` or `ValueError` is raised.
- `get_absolute_url()` → `users:detail` with `pk`.
- Migration: `users/0001_initial.py` (only migration).

**`sites.Site`** — data migration sets row `id=1` to `nekkoguard.com` / `NekkoGuard`.

### 4.2 Tables from third-party apps (no project customization)

- `rest_framework.authtoken`: `Token` (one-to-one with `User`).
- `allauth.account`: `EmailAddress`, `EmailConfirmation`.
- `allauth.socialaccount`: `SocialApp`, `SocialAccount`, `SocialToken`. No social providers are configured in settings.
- `allauth.mfa`: `Authenticator`.
- `django_celery_beat`: `PeriodicTask`, `IntervalSchedule`, `CrontabSchedule`, `SolarSchedule`, `ClockedSchedule`, `PeriodicTasks`.
- Django core: `auth`, `contenttypes`, `sessions`, `admin`, `sites`.

No other domain models exist.

---

## 5. API Structure

Defaults (`REST_FRAMEWORK`): authentication = `SessionAuthentication`, `TokenAuthentication`; permission = `IsAuthenticated`; schema = drf-spectacular `AutoSchema`. CORS headers apply only to `^/api/.*$`; no `CORS_ALLOWED_ORIGINS` is set (cross-origin requests are not allowed by default).

### 5.1 REST endpoints

| Path | Methods | Auth / permission | Behavior |
|---|---|---|---|
| `/api/` | GET | IsAuthenticated | Router root; **only when `DEBUG=True`** (`DefaultRouter`). |
| `/api/users/` | GET | IsAuthenticated | List — queryset filtered to `id = request.user.id`, so returns only the caller. |
| `/api/users/{pk}/` | GET | IsAuthenticated | Retrieve; 404 for any `pk` other than the caller's. |
| `/api/users/{pk}/` | PUT, PATCH | IsAuthenticated | Update caller's own record; only `name` is writable. |
| `/api/users/me/` | GET | IsAuthenticated | Returns the caller's serialized record (200). |
| `/api/auth-token/` | POST | none (DRF view default: AllowAny) | `obtain_auth_token`: body `username` (= email) + `password` → `{"token": "..."}`. Creates the token if absent. |
| `/api/schema/` | GET | `IsAdminUser` (`SERVE_PERMISSIONS`) | OpenAPI schema; prefix `/api/`. |
| `/api/docs/` | GET | `IsAdminUser` | Swagger UI. |

No create or delete on users via the API (`UserViewSet` = Retrieve + List + Update mixins).

**`UserSerializer`** fields: `name`, `url` (hyperlink to `api:user-detail` by `pk`). Email, id and flags are not exposed.

Production sets `SPECTACULAR_SETTINGS["SERVERS"] = [{"url": "https://nekkoguard.com"}]`.

### 5.2 HTML routes

| Path | View | Access |
|---|---|---|
| `/` | `pages/home.html` (TemplateView) | public |
| `/about/` | `pages/about.html` | public |
| `/users/~redirect/` | `UserRedirectView` → own detail page (post-login target, `LOGIN_REDIRECT_URL`) | login required |
| `/users/~update/` | `UserUpdateView` — edits own `name`, success message, redirects to own detail | login required |
| `/users/<int:pk>/` | `UserDetailView` | login required; **any logged-in user can view any user's detail page by pk** (no ownership check) |
| `/accounts/…` | `allauth.urls` (login, logout, signup, email confirm, password reset/change, email management, MFA, social) | allauth rules |
| `ADMIN_URL` | Django admin (`admin/` by default; `DJANGO_ADMIN_URL` in production) | staff |
| `/media/…` | `static()` helper (effective only when `DEBUG`) | public |
| `/400/`, `/403/`, `/404/`, `/500/` | error page previews | `DEBUG` only |
| `/__debug__/` | django-debug-toolbar | `DEBUG` + local settings |

### 5.3 WebSocket

Any WebSocket path: connection accepted unconditionally (no authentication); text `ping` → reply `pong!`; loop ends on disconnect. No other messages handled.

---

## 6. Business Logic

Only account-related logic exists; there is no service layer.

- **Registration** (`/accounts/signup/`): fields `email`, `password1`, `password2` (`ACCOUNT_SIGNUP_FIELDS`). Allowed only if `ACCOUNT_ALLOW_REGISTRATION` (env `DJANGO_ACCOUNT_ALLOW_REGISTRATION`, default `True`) — enforced by `AccountAdapter.is_open_for_signup` and `SocialAccountAdapter.is_open_for_signup`. The flag is also exposed to templates via `users.context_processors.allauth_settings`.
- **Email verification:** `ACCOUNT_EMAIL_VERIFICATION = "mandatory"` — users cannot log in until the confirmation link is used.
- **Login:** email only (`ACCOUNT_LOGIN_METHODS = {"email"}`), no username field.
- **Social signup:** `SocialAccountAdapter.populate_user` fills `User.name` from provider `name`, else `first_name` + optional `last_name`. No providers are configured, so this path is currently inactive.
- **Password rules:** Django's four default validators (similarity, minimum length, common password, numeric).
- **Profile management:** user may edit only `name` (HTML `UserUpdateView` and API `PATCH/PUT`).
- **Admin:** `UserAdmin` with email-based creation form (`UserAdminCreationForm`, custom unique-email error message), list `email`, `name`, `is_superuser`; search by `name`.
- **Transactions:** every request is atomic (`ATOMIC_REQUESTS`).

---

## 7. Authentication and Security

### 7.1 Authentication

- Backends: `ModelBackend` + `allauth.account.auth_backends.AuthenticationBackend`.
- Web: session cookies (allauth flows). `LOGIN_URL = "account_login"`.
- API: session (CSRF enforced by DRF) or `Authorization: Token <key>` (DRF authtoken; static, non-expiring tokens).
- MFA: `allauth.mfa` installed with default configuration (no `MFA_*` settings defined).
- Admin login can be forced through allauth (and therefore MFA) with `DJANGO_ADMIN_FORCE_ALLAUTH=True` (default `False`).

### 7.2 Authorization

- API: global `IsAuthenticated`; object scoping by queryset filter in `UserViewSet.get_queryset` (own record only).
- Schema/docs: `IsAdminUser`.
- HTML: `LoginRequiredMixin` on all `users` views; no object-level checks on `UserDetailView`.
- No groups, roles, custom permissions or multi-tenant isolation are defined.

### 7.3 Security settings

| Setting | All envs | Production |
|---|---|---|
| Password hashers | Argon2 → PBKDF2 → PBKDF2SHA1 → BCryptSHA256 | same |
| `SESSION_COOKIE_HTTPONLY`, `CSRF_COOKIE_HTTPONLY` | `True` | same |
| `X_FRAME_OPTIONS` | `DENY` | same |
| Cookies | — | `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`; names `__Secure-sessionid`, `__Secure-csrftoken` |
| HTTPS | — | `SECURE_SSL_REDIRECT` (default `True`), `SECURE_PROXY_SSL_HEADER = X-Forwarded-Proto` |
| HSTS | — | `SECURE_HSTS_SECONDS = 60`, include subdomains and preload (default `True`) |
| `SECURE_CONTENT_TYPE_NOSNIFF` | — | default `True` |
| `ALLOWED_HOSTS` | local: `localhost`, `0.0.0.0`, `127.0.0.1` | `DJANGO_ALLOWED_HOSTS` (default `nekkoguard.com`) |
| Admin URL | `admin/` | from `DJANGO_ADMIN_URL` (secret path) |

Middleware order: Security → CORS → WhiteNoise → Session → Locale → Common → CSRF → Auth → Messages → XFrameOptions → allauth `AccountMiddleware` (+ DebugToolbar in local).

Other: Flower protected by HTTP basic auth (`CELERY_FLOWER_USER` / `CELERY_FLOWER_PASSWORD`) in production; Traefik `csrf` middleware forwards `X-CSRFToken` via `hostsProxyHeaders`; production Django container runs as non-root user `django`.

---

## 8. Background Processing and Integrations

### 8.1 Celery

- App `nekkoguard` (`config/celery_app.py`), broker and result backend = `REDIS_URL` (TLS with `CERT_NONE` if URL scheme is `rediss://`).
- JSON-only serialization; `task_time_limit = 300 s`, `soft_time_limit = 60 s`; extended results; result backend retry (max 10); task events enabled (for Flower); worker does not hijack root logger.
- Beat scheduler: `django_celery_beat.schedulers:DatabaseScheduler` (schedules stored in PostgreSQL, managed via admin). **No periodic tasks are defined in code.**
- Local settings: `CELERY_TASK_EAGER_PROPAGATES = True` (eager mode itself is not enabled).
- Tasks: `nekkoguard.users.tasks.get_users_count` — returns `User.objects.count()` (demo; not called by application code).
- Processes: `celeryworker`, `celerybeat`, `flower` (port 5555; waits until `celery inspect ping` succeeds).

### 8.2 Signals

- Celery `setup_logging` signal → applies `settings.LOGGING`.
- No Django model signals are defined. `UsersConfig.ready()` is empty.

### 8.3 External services

| Service | Use | Environment |
|---|---|---|
| PostgreSQL | primary DB | all |
| Redis | Celery broker/results; Django cache (`django_redis`, `IGNORE_EXCEPTIONS=True`) in production; local uses `LocMemCache` | all |
| Mailpit (SMTP, default `mailpit:1025`) | email capture | development, local |
| Mailgun (anymail) | transactional email (allauth confirmations, password reset) | production |
| Sentry | error/event reporting (`traces_sample_rate` default `0.0`) | production |
| Let's Encrypt | TLS certificates via Traefik | production |

No other outbound API integrations exist.

---

## 9. Configuration and Environment

### 9.1 Settings modules

| Module | Use | Key differences |
|---|---|---|
| `config.settings.base` | shared | everything in §5–8 |
| `config.settings.local` | default for `manage.py`, ASGI and Celery (`DJANGO_SETTINGS_MODULE` fallback) | `DEBUG=True`, LocMem cache, SMTP to Mailpit, debug toolbar, django-extensions |
| `config.settings.production` | set via `DJANGO_SETTINGS_MODULE` in `.envs/.production/.django` | Redis cache, Mailgun, Sentry, HTTPS hardening, `CONN_MAX_AGE` (default 60), WhiteNoise `CompressedManifestStaticFilesStorage` |
| `config.settings.test` | pytest | MD5 hasher, locmem email backend, template debug |

Fixed values: `TIME_ZONE = "Europe/Lisbon"`, `LANGUAGE_CODE = "en-us"`, `USE_I18N`, `USE_TZ`, `SITE_ID = 1`, `EMAIL_TIMEOUT = 5`, `STATIC_ROOT = staticfiles/`, `MEDIA_ROOT = nekkoguard/media/`.

### 9.2 Environment variables

Env files live in `.envs/.{development,local,production}/.{django,postgres}` and are git-ignored.

| Variable | Used by | Default / required |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | all | `config.settings.local` |
| `DJANGO_READ_DOT_ENV_FILE` | base | `False`; if true reads `<root>/.env` |
| `DJANGO_DEBUG` | base | `False` (local forces `True`) |
| `DJANGO_SECRET_KEY` | local/test (defaulted), production (**required**) | — |
| `DATABASE_URL` | base | optional; overrides `POSTGRES_*` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | base, entrypoint, backups | required if no `DATABASE_URL` |
| `POSTGRES_HOST`, `POSTGRES_PORT` | base, entrypoint | `postgres`, `5432` |
| `CONN_MAX_AGE` | production | `60` |
| `REDIS_URL` | base, Flower | `redis://redis:6379/0` |
| `DJANGO_EMAIL_BACKEND` | base | SMTP backend (overridden in production/test) |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | local | `mailpit`, `1025`, empty, empty |
| `DJANGO_DEFAULT_FROM_EMAIL` | local, production | `webmaster@localhost` / `NekkoGuard <noreply@nekkoguard.com>` |
| `DJANGO_SERVER_EMAIL`, `DJANGO_EMAIL_SUBJECT_PREFIX` | production | from-email / `[NekkoGuard] ` |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` | production | **required** |
| `MAILGUN_API_URL` | production | `https://api.mailgun.net/v3` |
| `DJANGO_ADMIN_URL` | production | **required** |
| `DJANGO_ALLOWED_HOSTS` | production | `nekkoguard.com` |
| `DJANGO_SECURE_SSL_REDIRECT`, `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS`, `DJANGO_SECURE_HSTS_PRELOAD`, `DJANGO_SECURE_CONTENT_TYPE_NOSNIFF` | production | `True` |
| `DJANGO_ACCOUNT_ALLOW_REGISTRATION` | base | `True` |
| `DJANGO_ADMIN_FORCE_ALLAUTH` | base | `False` |
| `SENTRY_DSN` | production | **required** |
| `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `DJANGO_SENTRY_LOG_LEVEL` | production | `production`, `0.0`, `INFO` |
| `USE_DOCKER` | local | **required** (`yes` adds Docker gateway IPs to `INTERNAL_IPS`) |
| `CELERY_FLOWER_USER`, `CELERY_FLOWER_PASSWORD` | Flower start script | required for Flower |
| `WEB_CONCURRENCY` | production env file (read by Gunicorn) | — |
| `IPYTHONDIR` | dev env files | — |

`merge_production_dotenvs_in_dotenv.py` concatenates `.envs/.production/.django` and `.postgres` into `<root>/.env`.

### 9.3 Deployment stacks

| Compose file | Services | Notes |
|---|---|---|
| `docker-compose.local.yml` (default for `justfile`) | django (`:8000`), redis, celeryworker, celerybeat, flower (`:5555`) | Uses PostgreSQL and Mailpit already running in the host's k3s cluster (`postgres.databases.svc.cluster.local`, `mailpit.email.svc.cluster.local`) resolved through cluster DNS `10.43.0.10`; env files required. |
| `docker-compose.development.yml` | django, postgres (18), redis, mailpit (`:8025`), celeryworker, celerybeat, flower | Self-contained; used by CI. |
| `docker-compose.production.yml` | django, postgres, redis, traefik (`:80`, `:443`, `:5555`), nginx (media), celeryworker, celerybeat, flower | Traefik routes `nekkoguard.com`/`www.nekkoguard.com` → `django:5000`, `/media/` → nginx, `:5555` → Flower; HTTP→HTTPS redirect. |
| `docker-compose.docs.yml` | Sphinx docs (`:9000`) | — |

- Dev start: `python manage.py migrate` then `uvicorn config.asgi:application --reload`.
- Prod start: `collectstatic` then `gunicorn config.asgi -k uvicorn_worker.UvicornWorker` on `:5000`. Migrations are **not** run automatically in production.
- Entrypoint waits up to 30 s for `POSTGRES_HOST:POSTGRES_PORT` (`wait-for-it`).
- Images: build `ghcr.io/astral-sh/uv:python3.14-bookworm-slim`, run `python:3.14-slim-bookworm`.
- Postgres image includes maintenance scripts `backup`, `backups`, `restore`, `rmbackup` (gzip `pg_dump` into `/backups`; refuses to run as `postgres` user).
- CI (`.github/workflows/ci.yml`, on `main`): pre-commit lint; build dev stack; `makemigrations --check`; `migrate`; `pytest`.

---

## 10. Critical Dependencies and Relationships

**Required for the web process to start**
- PostgreSQL reachable (entrypoint blocks otherwise) with migrations applied.
- `DJANGO_SECRET_KEY`; in production also `DJANGO_ADMIN_URL`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `SENTRY_DSN` (settings import fails without them).
- `USE_DOCKER` defined when using local settings.

**Required for full functionality**
- Redis: Celery broker/results (all envs) and cache (production; failures ignored).
- Working email backend: mandatory email verification blocks login without it.
- Traefik + nginx in production for TLS termination and media serving.

**Internal coupling**
- `AUTH_USER_MODEL = users.User` — every auth, allauth, authtoken and admin table depends on it; it must exist before any other migration.
- `LOGIN_REDIRECT_URL = users:redirect` and `User.get_absolute_url` tie allauth flows to `users.urls`.
- `api:user-detail` route name is required by `UserSerializer.url`.
- `MIGRATION_MODULES["sites"]` → `nekkoguard.contrib.sites.migrations`; `SITE_ID = 1` used by allauth for email links.
- Celery autodiscovery depends on `INSTALLED_APPS`; beat depends on `django_celery_beat` tables.
