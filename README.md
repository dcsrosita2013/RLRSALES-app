# RLR Sales and Services — Business Management System

Web-based AR / inventory / industrial-parts sales management for **RLR Sales and Services Corporation**.

- **Frontend:** React + Vite + TypeScript, Tailwind CSS, React Router
- **Backend:** Node.js + Express (TypeScript), REST API
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** JWT + bcrypt, role-based access control (server-enforced)

> **Build status:** **Phase 1 complete** — project scaffold, full DB schema, authentication + roles, login, forced first-login password change, and the dashboard shell with the RLR logo and role-filtered navigation. See the [Roadmap](#roadmap).

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ (tested on 24) | https://nodejs.org |
| Docker Desktop | any recent | Used to run PostgreSQL with zero local setup |

> No local PostgreSQL install is required — the included `docker-compose.yml` runs it for you. If you already run your own Postgres, see [Using your own Postgres](#using-your-own-postgres).

### Ports

This project uses **non-default ports** to avoid clashing with other local stacks:

| Service | URL / Port |
|---------|-----------|
| Frontend (Vite) | http://localhost:5173 |
| Backend API (Express) | http://localhost:4100 |
| PostgreSQL (Docker) | localhost:5433 |

---

## Project structure

```
RLR SALES AND SERVICE/
├── docker-compose.yml          # PostgreSQL (host port 5433)
├── .env.example                # Compose DB credentials
├── backups/                    # DB backup files land here
├── server/                     # Express + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma        # Full DB schema (all modules)
│   │   ├── seed.ts              # Seed: users, master data, sample inventory
│   │   └── migrations/          # Generated SQL migrations
│   ├── src/
│   │   ├── index.ts             # App entry
│   │   ├── routes.ts            # /api router
│   │   ├── config/env.ts        # Env loading/validation
│   │   ├── lib/                 # prisma, jwt, password, audit, sequence
│   │   ├── middleware/          # requireAuth, requireRole, error handler
│   │   ├── modules/auth/        # login, me, change-password
│   │   └── scripts/             # backup.ts, reset-demo-users.ts
│   ├── .env.example
│   └── package.json
└── client/                     # React app
    ├── public/                  # rlr-logo.png goes here (SVG fallback included)
    ├── src/
    │   ├── main.tsx, App.tsx
    │   ├── context/AuthContext.tsx
    │   ├── routes/ProtectedRoute.tsx
    │   ├── components/          # Logo, ui/, layout/ (Sidebar, Topbar)
    │   ├── pages/               # Login, ChangePassword, Dashboard, Placeholder
    │   └── lib/                 # api client, types
    ├── tailwind.config.js       # Brand navy/silver palette
    └── package.json
```

---

## Setup

From the project root (`RLR SALES AND SERVICE/`). Commands shown for **PowerShell** (Windows).

### 1. Start the database

```powershell
docker compose up -d db
```

This starts PostgreSQL on `localhost:5433` (database `rlr_db`, user `rlr`, password `rlr_password`).

### 2. Backend

```powershell
cd server
copy .env.example .env        # then open .env and set a strong JWT_SECRET
npm install
npm run prisma:migrate        # creates tables (first run: name it e.g. "init")
npm run db:seed               # seeds users, categories, brands, sample data
npm run dev                   # API on http://localhost:4100
```

### 3. Frontend (new terminal)

```powershell
cd client
npm install
npm run dev                   # app on http://localhost:5173
```

Open **http://localhost:5173** and sign in.

---

## Default login accounts

All seeded users share a temporary password and are **forced to change it on first login**.

| Username | Role | Temporary password |
|----------|------|--------------------|
| `admin` | Admin / Owner | `Rlr@Temp2026` |
| `agent1` | Sales Agent | `Rlr@Temp2026` |
| `warehouse` | Warehouse | `Rlr@Temp2026` |
| `finance` | Finance / Collections | `Rlr@Temp2026` |

> Need to hand out fresh demo logins again later? `cd server && npm run reset-users` restores all four to the temp password and re-arms the forced change.

### Roles & permissions (enforced server-side)

| Capability | Admin | Agent | Warehouse | Finance |
|-----------|:-----:|:-----:|:---------:|:-------:|
| Mark Sales Invoice Paid/Unpaid | ✅ | — | — | — |
| Edit/void a finalized Sales Invoice | ✅ | — | — | — |
| Create quotations / invoices / DRs | ✅ | ✅ | — | — |
| Manage inventory / receive stock / edit DRs & POs | ✅ | — | ✅ | — |
| Record collections, mark PO paid, check vouchers | ✅ | — | — | ✅ |

---

## The company logo

Drop the official **`rlr-logo.png`** into **`client/public/rlr-logo.png`**. It appears in the sidebar, login, and (from Phase 3) printed documents. Until you add it, a built-in SVG fallback (`client/public/rlr-logo.svg`) is shown so nothing looks broken.

---

## Scripts

### Backend (`server/`)
| Script | Purpose |
|--------|---------|
| `npm run dev` | Start API with hot reload (port 4100) |
| `npm run build` / `npm start` | Compile to `dist/` / run compiled |
| `npm run typecheck` | Type-check only |
| `npm run prisma:migrate` | Create & apply a dev migration |
| `npm run prisma:deploy` | Apply existing migrations (production) |
| `npm run db:seed` | Seed master + sample data |
| `npm run reset-users` | Restore the 4 demo logins |
| `npm run backup` | Write a timestamped DB backup to `backups/` |

### Frontend (`client/`)
| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |

---

## Backup & restore

### Create a backup
```powershell
cd server
npm run backup
```
Writes `backups/rlr-backup-<timestamp>.sql`. It uses a local `pg_dump` if available, otherwise dumps from the Docker container automatically.

> **Scheduling:** until the in-app scheduler lands (Phase 7), schedule backups with **Windows Task Scheduler** running `npm run backup` in `server/` daily.

### Restore a backup
Using the Docker container (PowerShell):
```powershell
Get-Content backups\rlr-backup-<timestamp>.sql | docker exec -i rlr_postgres psql -U rlr -d rlr_db
```
Or with a local `psql`:
```powershell
psql "postgresql://rlr:rlr_password@localhost:5433/rlr_db" -f backups\rlr-backup-<timestamp>.sql
```

---

## Using your own Postgres

If you don't want Docker, point `server/.env` `DATABASE_URL` at your server, e.g.:
```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/rlr_db?schema=public"
```
Create the `rlr_db` database, then run `npm run prisma:migrate` and `npm run db:seed`.

---

## Notes

- **Prisma safety:** destructive commands (`prisma migrate reset`) are intentionally guarded and will refuse to run unattended. Use `npm run reset-users` for routine demo resets.
- **Audit trail:** logins and password changes are already recorded in the `AuditLog` table; invoice/payment actions are logged as those modules land.
- **Document numbering:** `INV-`, `DR-`, `PO-`, `CV-`, `QTN-`, `COL-` sequences are seeded with configurable prefix/start (`DocumentSequence` table).

---

## Roadmap

- [x] **Phase 1** — Scaffold, schema, auth + roles, login, dashboard shell with logo
- [x] **Phase 2** — Master data: Products (25/30/35% pricing, floor/room stock), Categories, Brands, Customers, Agents, Suppliers
- [x] **Phase 3** — Sales Invoice (VAT logic, discount, status lock, stock deduction, PDF)
- [x] **Phase 4** — Delivery Receipt + Purchase Order (PDFs, warehouse edit, stock-receive, **Admin-only PO approval**)
- [x] _Add-ons_ — Editable invoice & DR numbers; `set-seq` starting numbers; password-protected delete (invoices/POs); CSV/Excel inventory import; customer payment terms (auto-fill on invoices/DRs); inventory last-received date; agent daily/monthly sales monitoring (dashboard); **Agent Commission report** (origin-based: PH ≥25%→3.5%, China ≥30%→5%)
- [x] **Phase 5** — Quotation (convert→invoice), Collection (auto-updates invoice paid), Check Voucher (pays POs)
- [x] **Phase 6** — Reports (11) + Excel exports + date-range filters
- [x] **Phase 7** — Backup/restore (+ scheduling) + audit-trail viewer + numbering settings + user management

**🎉 MVP complete — all 7 phases delivered.**
```
