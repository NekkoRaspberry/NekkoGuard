# NekkoGuard Roadmap

Release plan for NekkoGuard (backend + frontend). Based on
`NekkoGuard_base_Specification` and `NekkoGuard_BE_Specification`.

The frontend only owns the auth pages; every other feature needs backend
models, API and tests first, then the frontend page that uses them.

## Releases

| Release | Scope | Why here |
|---|---|---|
| **v0.1 Auth** | Commit current work. Fix: any logged-in user can open any user's profile page; WebSocket accepts unauthenticated connections. Add login-attempt limiting. | Almost done |
| **v0.2 Tenancy** | Organization → Client → Site → Network models, memberships with the 6 roles, org switcher (FE), shared permission check for every endpoint, audit log | Everything else depends on it |
| **v0.3 Discovery + Devices** | Celery task runs `nmap` on allowed networks, saves devices + history, basic `Alert` model (new device). FE: device list, device detail, simple topology | Core of the product |
| **v0.4 Ports & Services** | Extend scan (`nmap -sV`) to save ports/services, alert on new open ports | Builds on the v0.3 scanner |
| **v0.5 Alerts UI + Overview** | Alerts page (acknowledge/resolve), first real Overview dashboard | Earlier modules now create alerts |
| **v0.6 Certificates + Email/Domain** | Scheduled TLS expiry checks, SPF/DKIM/DMARC checks | Server-side, no agent needed |
| **v0.7 Pi-hole** | Read Pi-hole API on a schedule, show stats | Self-contained integration |
| **v0.8 Containers** | Docker hosts + containers, start/stop/restart with confirmation, audit-logged | Use `docker-socket-proxy`, never the raw socket |
| **v0.9 Agents** | Agent registration, revocable tokens, check-ins, assigned scan scope | Needed for software inventory |
| **v0.10 Software + Vulnerabilities** | Agents report packages, matched against OSV.dev / NVD | Depends on agents |
| **v0.11 Logs** | Collect platform, Docker, agent and SSH events; search and filters | Uses events from earlier modules |
| **v0.12 Analytics + Global search** | History charts, reports, search across all data | Needs the data to exist |
| **v1.0 Production** | Settings pages, security review, backups, production deploy | Hardening |

**Rule:** don't start the next release until the current one is merged and
tagged. New ideas become issues in a later milestone.

## Workflow

1. Open an issue (assigned to a milestone) on the GitHub Project board.
2. Branch off `dev` (e.g. `feat/device-list`).
3. PR into `dev`, merge.
4. When the milestone is done: merge `dev` → `main`, then create the
   release: `gh release create vX.Y.0 --generate-notes`
   (release notes are generated on GitHub from the merged PRs; no files
   in the repo change).

## Tooling

GitHub only, managed with the `gh` CLI:

- **Issues** — tasks; labels `backend`, `frontend`, `security`.
- **Milestones** — one per release above.
- **Project board** — Todo / In progress / Done; built-in workflows move
  items automatically (issue added → Todo, closed → Done).
- **Releases** — `gh release create` with auto-generated notes.
