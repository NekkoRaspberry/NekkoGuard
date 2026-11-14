<div align="center">

<img src="nekkoguard_FE/public/favicon.svg" width="96" alt="NekkoGuard logo" />

# NekkoGuard

**Self-hosted guardian for your home network** 🛡️
Know what's on your network, see what changed, and get warned before something goes wrong.

[![CI](https://github.com/NekkoRaspberry/NekkoGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/NekkoRaspberry/NekkoGuard/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-6.0-0C4B33?logo=django&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-ARM64-A22846?logo=raspberrypi&logoColor=white)

</div>

---

## 👋 What is NekkoGuard?

A modern home has more connected things than anyone can keep track of: laptops, phones, smart TVs, cameras, printers, a router, maybe a few small servers. Each one is a door into your network, and most of us have no idea which doors are open.

**NekkoGuard keeps watch for you.** It runs quietly on a Raspberry Pi in your home, maps the devices on your network, notices when something new appears or changes, and tells you when it finds a problem — an exposed service, a certificate about to expire, a device that shouldn't be there.

Everything stays **on your own hardware**. No cloud account, no data leaving your home, no subscription.

## 💡 Why it exists

Big companies have security teams and expensive tools to watch their networks. Homes and small offices have nothing — even though they face many of the same risks. NekkoGuard brings that kind of visibility to a small, affordable box, with a clean dashboard that anyone can understand, not just network engineers.

## 🔭 What it does

| | Feature | Status |
|---|---|---|
| 🔐 | **Secure accounts** — sign-up, email verification and two-factor authentication | ✅ Ready |
| 🌐 | **Sign in with Google, GitHub or LinkedIn** | ✅ Ready |
| 🔗 | **Connected apps** — let your other self-hosted tools "Sign in with NekkoGuard" | ✅ Ready |
| 🏢 | **Organizations** — one place for several homes, clients or sites | 🛠️ Next |
| 📡 | **Network discovery** — find every device and keep its history | 🛠️ Planned |
| 🚪 | **Ports & services** — see what each device exposes | 🛠️ Planned |
| 🚨 | **Alerts & overview** — new devices, new open ports, all in one dashboard | 🛠️ Planned |
| 📜 | **Certificates & email security** — expiry and misconfiguration checks | 🛠️ Planned |
| 🕳️ | **Pi-hole & containers** — DNS stats and Docker at a glance | 🛠️ Planned |

The full release plan lives in the [🗺️ roadmap](nekkoguard_BE/ROADMAP.md).

## 🧭 Principles

- 🏠 **Yours** — self-hosted, private by default, no external services required
- 🪶 **Lightweight** — built to run 24/7 on a Raspberry Pi
- 🔒 **Secure** — two-factor everywhere it matters, nothing exposed by default
- 🙂 **Simple** — a clear dashboard first, technical details only when you need them

## 🗂️ Project structure

NekkoGuard is two projects in one repository:

```text
NekkoGuard/
├── 🐍 nekkoguard_BE/      Backend — the brain: data, security and the API
├── ⚛️  nekkoguard_FE/      Frontend — the dashboard you use in the browser
└── ⚙️  .github/            Automatic checks on every change
```

| | Backend | Frontend |
|---|---|---|
| **Role** | Stores everything, runs the checks, keeps accounts safe | Shows it all in a clean, dark dashboard |
| **Built with** | Python · Django · PostgreSQL | React · TypeScript |
| **Read more** | [🐍 Backend README](nekkoguard_BE/README.md) | [⚛️ Frontend README](nekkoguard_FE/README.md) |

## 🚀 Quick start

Both parts run in Docker, so the Pi only needs Docker installed.

```bash
# 1. Start the backend
cd nekkoguard_BE && docker compose -f docker-compose.local.yml up -d

# 2. Start the dashboard
cd ../nekkoguard_FE && docker compose up -d --build
```

Then open **http://&lt;PI_IP&gt;:8080** in your browser and create your account.

---

<div align="center">
<sub>Made for the Raspberry Pi 🍓 · Lightweight · Private · Always on</sub>
</div>
