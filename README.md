# Sprasa HR

HR and payroll software for Nepali organisations, by [Sprasa Technical Solution](https://sprasatechnicalsolution.com.np/).

Sprasa HR keeps employee records, attendance, leave, payroll and reports in one place. It uses NPR, the Asia/Kathmandu timezone, a Sunday-to-Friday working week and a fiscal year that starts in Shrawan by default, and every one of those is a setting you can change.

> **Tax and statutory rates are configuration, not code.** The app ships with sample tax slabs and example PF/SSF rates so the demo works. Before you run official payroll, your accountant or tax professional needs to check the tax slabs, contribution rates and caps against the rules that currently apply to your organisation.

---

## Contents

1. [What it does](#1-what-it-does)
2. [Features](#2-features)
3. [Technology](#3-technology)
4. [Requirements](#4-requirements)
5. [Installation](#5-installation)
6. [Environment variables](#6-environment-variables)
7. [Database setup](#7-database-setup)
8. [Prisma migrations](#8-prisma-migrations)
9. [Seed data](#9-seed-data)
10. [Development commands](#10-development-commands)
11. [Production build](#11-production-build)
12. [Deployment](#12-deployment)
13. [Backups](#13-backups)
14. [Testing](#14-testing)
15. [Security](#15-security)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. What it does

An HR team records who works here, what they're paid and when they're in. Managers approve leave for their own people. Accounts runs payroll once a month, checks it, approves it, and every employee gets a payslip they can download. Management gets headcount, attendance, leave and payroll reports that export to Excel or PDF.

Employees sign in to check in and out, apply for leave, see their balances and download their payslips. They never see anyone else's data.

## 2. Features

**People.** Employee records with Nepal-specific fields (PAN, citizenship number, SSF/PF/CIT numbers, province, district, municipality). Departments, designations and reporting lines, plus an organisation chart. Employment history is written automatically on joining, transfer, promotion, salary change and exit. Documents with expiry tracking. Import from Excel or CSV. The whole file is checked first, and nothing is imported if any row has an error.

**Attendance.** Shifts with grace periods, breaks, overnight hours and a flexible option. Late, early-leave and overtime minutes are worked out from each person's shift. Entry can be one record at a time, bulk for a whole department, or employee self check-in. The holiday calendar feeds working-day counts everywhere.

**Leave.** Configurable leave types (annual, sick, casual, maternity, paternity, unpaid and your own) with pro-rated entitlement, carry-forward caps and half days. Workflow: employee applies, supervisor approves, HR gives final approval where the leave type needs it. Balances reserve days as soon as someone applies and move them to used on approval. Requests that overlap, run past the balance or have impossible dates are rejected. Approved leave marks attendance too.

**Payroll.** Salary components (earnings and deductions, fixed or percentage-based) combine into reusable structures. A salary change creates a new effective-dated record, so old payroll is never rewritten. Monthly adjustments cover bonus, commission, loan instalments and advance recovery. The payroll engine takes unpaid leave and absences off at a daily rate, adds overtime at a configurable multiplier, caps retirement contributions against taxable income, and works out tax from effective-dated progressive slabs, with an optional SSF waiver per slab. A run moves Draft → Reviewed → Approved → Paid. Approval locks the figures and issues payslips (PDF, print and self-service). The payroll register exports to CSV, Excel and PDF.

**Reports.** 21 reports: employee list, department headcount, designations, new joiners, exits, turnover, daily and monthly attendance, late arrivals, absence, overtime, leave balance, leave usage, leave by department, leave history, monthly payroll, payroll register, department payroll, salary summary, deduction summary and tax summary. Each one filters by date, department and employee where that makes sense, and exports.

**Platform.** Role-based access (Super Admin, HR Admin, HR Officer, Manager, Accountant, Employee, plus custom roles) with row-level scope: whole organisation, own team, or only themselves. Audit log. In-app and email notifications. Multi-organisation support for super admins. Light and dark themes. A responsive layout with a bottom tab bar on phones. English interface with a Nepali translation started.

## 3. Technology

| Part | Stack |
| --- | --- |
| API | Node.js 20+, TypeScript, Express 5, Prisma 6, PostgreSQL, Zod, JWT + rotating refresh cookies, Pino logging |
| Web | React 19, TypeScript, Vite, Tailwind CSS 4, Radix UI primitives, TanStack Query, React Hook Form, Recharts, Lucide icons |
| Files | PDFKit (payslips, PDF exports), ExcelJS (Excel import/export), csv-parse / csv-stringify |
| Tests | Vitest, Supertest, Testing Library |
| Ops | Docker Compose, Nginx, `pg_dump` backups, node-cron jobs |

Layout:

```text
sprasa-hr/
├── backend/        Express API (src/modules/<feature>/…, src/services, src/middleware)
├── frontend/       React app (src/features/<feature>/…, src/components, src/lib)
├── prisma/         schema.prisma, migrations, seed.ts
├── docs/           ARCHITECTURE.md, DEPLOYMENT.md
├── uploads/        private file storage (not served statically)
├── docker-compose.yml
└── package.json    npm workspaces: backend, frontend
```

## 4. Requirements

- Node.js 20 or newer (22 LTS recommended) and npm 10
- PostgreSQL 14 or newer (16–18 tested)
- `pg_dump` on the PATH if you want the built-in backups
- Optional: Docker Desktop, for the containerised setup

## 5. Installation

```bash
git clone <your repository url> sprasa-hr
cd sprasa-hr
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Then edit `backend/.env`. At minimum set `DATABASE_URL` and two long random JWT secrets (see the next section).

## 6. Environment variables

All backend settings live in `backend/.env`. The server refuses to start if a required value is missing or too short, and it only prints the variable name, never the value.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test` or `production` |
| `PORT` | API port, default `5000` |
| `DATABASE_URL` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | Separate database for integration tests. Its name must contain `_test` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | 32+ random characters each. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_ACCESS_TTL` | Access token lifetime, default `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | Sign-in lifetime, default `7` |
| `FRONTEND_URL` | Used in email links and CORS |
| `CORS_ORIGINS` | Extra allowed origins, comma separated |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Outgoing email. Leave `SMTP_HOST` empty in development and emails go to the server log |
| `UPLOAD_DIR` | Private folder for uploaded files. Never serve it statically |
| `MAX_FILE_SIZE`, `ALLOWED_UPLOAD_TYPES` | Upload limits |
| `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`, `BACKUP_CRON`, `PG_DUMP_PATH` | Backups (see section 13) |
| `ENABLE_JOBS` | Set `false` on extra API instances so scheduled jobs run once |
| `LOG_LEVEL` | `info` by default |

The frontend has one variable, `VITE_API_URL`, which defaults to `/api/v1`. In development Vite proxies `/api` to `localhost:5000`. In production Nginx does the same.

Never commit a real `.env`. It is already in `.gitignore`.

## 7. Database setup

Create a database and a user that owns it. `CREATEDB` lets Prisma make its temporary shadow database during `migrate dev`.

```sql
CREATE ROLE sprasa WITH LOGIN PASSWORD 'choose-a-password' CREATEDB;
CREATE DATABASE sprasa_hr OWNER sprasa;
-- only if you will run the integration tests:
CREATE DATABASE sprasa_hr_test OWNER sprasa;
```

On Windows you can run this from pgAdmin's Query Tool or `psql -U postgres`. Put the same credentials into `DATABASE_URL`.

## 8. Prisma migrations

The schema is in `prisma/schema.prisma` and the migrations are in `prisma/migrations`.

```bash
npm run db:generate                     # generate the Prisma client
npm run db:migrate                      # development: apply and create migrations
npm run db:deploy -w backend            # production: apply existing migrations only
npm run db:studio                       # browse data in Prisma Studio
```

After changing `schema.prisma`, run `npm run db:migrate -- --name what-changed` and commit the new folder under `prisma/migrations`.

## 9. Seed data

```bash
npm run db:seed
```

This creates **Sprasa Demo Organisation** with six departments, around 40 fictional employees, shifts, 2026 holidays, attendance from June to today, leave in every state, three months of processed payroll plus a draft for the current month, and a few documents. Every name and number is made up.

Demo logins (password is `Sprasa@2026` unless you set `SEED_PASSWORD`):

| Username | Role | What to try |
| --- | --- | --- |
| `superadmin` | Super Admin | Everything, including roles and backups |
| `hradmin` | HR Admin | Employees, leave approvals, settings |
| `manager` | Manager | Team view and supervisor approvals |
| `accountant` | Accountant | Payroll: review, approve, payslips |
| `employee` | Employee | Self-service: check in, apply for leave, payslips |

The seed refuses to run on a database that already has data. `SEED_RESET=true npm run db:seed` wipes every table first, and it will not do that when `NODE_ENV=production`.

**Change these passwords, or delete the demo users, before anyone else can reach the server.**

## 10. Development commands

From the repository root:

```bash
npm run dev      # API on :5000 and web app on :5173, with reload
npm run build    # compile the API and build the web app
npm run start    # run the compiled API
npm run lint     # ESLint + TypeScript for both packages
npm run test     # backend unit + integration tests, frontend tests
```

Open http://localhost:5173. The public product page is `/`, the app is `/app`.

## 11. Production build

```bash
npm ci
npm run db:generate
npm run build
npm run db:deploy -w backend
NODE_ENV=production npm run start
```

The web app builds to `frontend/dist`. Serve it with Nginx, a CDN or any static host, and send `/api` to the Node process.

## 12. Deployment

The short version: PostgreSQL, one Node process for the API (under systemd or PM2), and Nginx serving the built frontend and proxying `/api`, all behind HTTPS. A domain such as `hr.sprasatechnicalsolution.com.np` works well.

For Docker:

```bash
cp .env.example .env        # set POSTGRES_PASSWORD and both JWT secrets
docker compose up --build -d
docker compose exec backend npx prisma db seed   # optional demo data
```

The app is then on http://localhost:8080. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) covers a bare-metal install, the Nginx and TLS config, and the pre-launch checklist.

## 13. Backups

- **Database:** `pg_dump` in custom format, one file per run. Restore with `pg_restore`.
- **Documents:** the uploads folder is copied next to each dump.
- **Schedule:** `BACKUP_CRON` in Nepal time, 02:00 daily by default. Admins with the backup permission can also run one from Settings → System & backups, and see the history there.
- **Retention:** runs older than `BACKUP_RETENTION_DAYS` are deleted.

A backup on the same disk as the database only protects you from mistakes, not from a dead disk. Copy `BACKUP_DIR` somewhere else every night (another server, S3-compatible storage, or an encrypted external drive), and test a restore now and then. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#backups) has example commands.

## 14. Testing

```bash
npm run test -w backend              # unit + integration
npx vitest run tests/unit -w backend # engines only, no database needed
npm run test -w frontend
```

Unit tests cover the payroll engine (including the spec example: NPR 30,000 basic + 5,000 allowance + 2,000 overtime gives 37,000 gross and 36,000 before tax), the tax slab engine, leave counting and balances (18 entitled − 5 used = 13), carry-forward, pro-rating, and attendance rules for late, overtime, half-day and overnight shifts.

Integration tests run the real API against `TEST_DATABASE_URL`: sign-in, lockout, refresh-token rotation and reuse detection, CSRF, employee CRUD and validation, manager and employee data scopes, sensitive-field redaction, salary history, the full leave workflow, and payroll generate → review → approve → payslip → export → cancel.

Frontend tests cover the data table (desktop and mobile), pagination, login and leave-form validation, and the payroll review actions shown for each role.

## 15. Security

- Passwords are hashed with bcrypt (cost 12). Five wrong attempts lock the account for 15 minutes, and login and password endpoints are rate limited per IP.
- Access tokens last 15 minutes and are kept in memory in the browser. The refresh token is an HTTP-only, SameSite=Strict cookie that rotates on every use. Reusing an old one revokes the whole session family. Refresh and logout also need a double-submit CSRF token.
- Every protected route checks, in order: a valid token, an active account, the organisation, the permission, and the row-level scope (organisation, team or self). The frontend only hides buttons. The API makes the decision.
- Request bodies are validated with Zod schemas that drop unknown fields, which blocks mass assignment. Prisma parameterises every query.
- Salary, bank, PAN, citizenship and personal contact fields are blanked for anyone without `employees.view_sensitive`.
- Uploads are checked by MIME type, extension, size and the file's own leading bytes, then stored under random names outside any public folder. Every download re-checks access.
- Helmet sets security headers. CORS is limited to your frontend. Errors never include stack traces in production.
- Audit logs record logins, employee and salary changes, payroll and leave decisions, and settings changes, with IP and user agent. There is no API to edit or delete them.
- Logs redact passwords, tokens and cookies.

Found a security problem? Please email Sprasa Technical Solution rather than opening a public issue.

## 16. Troubleshooting

**"Invalid environment configuration" on start.** The message names the variables that are missing or too short. Check `backend/.env`.

**`P1000: Authentication failed` from Prisma.** The username or password in `DATABASE_URL` doesn't match PostgreSQL. Test it with `psql "<your DATABASE_URL>"`.

**`permission denied to create database` during `migrate dev`.** The database user needs `CREATEDB` for Prisma's shadow database: `ALTER ROLE sprasa CREATEDB;`

**Emails don't arrive.** With `SMTP_HOST` empty they're only logged. Settings → System & backups shows whether SMTP connects.

**Backups fail with "Could not start pg_dump".** Install the PostgreSQL client tools or set `PG_DUMP_PATH`, for example `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`.

**Signed out after every refresh in production.** The refresh cookie is `Secure` in production, so the site must be served over HTTPS, and `FRONTEND_URL` must match the address in the browser.

**Payroll shows no tax.** No active tax slab covers the payroll month for that employee's category. Check Payroll → Tax configuration and the slabs' effective dates.

**An employee is missing from payroll.** They need a salary whose effective dates overlap the month, and a join date on or before the end of it.
