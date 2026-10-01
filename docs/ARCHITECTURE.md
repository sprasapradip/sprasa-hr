# Architecture notes

These notes are for developers working on Sprasa HR. They cover the parts that aren't obvious from reading one file.

## Backend layout

```text
backend/src/
├── app.ts, server.ts         Express setup and process lifecycle
├── config/                   env (validated with Zod), permission catalogue and default roles
├── middleware/               auth, CSRF + rate limits, uploads, validation helpers, error handler
├── modules/<feature>/        routes → controller → service (+ schemas)
├── services/
│   ├── engines/              pure calculation code: payroll, tax, leave, attendance, calendar
│   ├── access.service.ts     row-level scope (organisation / team / self) and field redaction
│   ├── audit.service.ts      audit writes, usable inside transactions
│   ├── notification.service  channel fan-out (in-app, email; add SMS/push here)
│   ├── export.service.ts     one table definition → CSV, Excel or PDF
│   └── backup.service.ts     pg_dump + uploads copy + retention
├── jobs/                     cron: backups, document expiry, leave-year rollover
└── emails/templates.ts       all outgoing email, HTML-escaped
```

Rules the code follows:

- **Business rules live in services and engines, never in React.** The engines take plain inputs and return plain outputs, which is why they have fast unit tests that need no database.
- **Every employee-linked query goes through `employeeScope(auth)`.** Managers see their reports (by manager, supervisor or department head), employees see only themselves. A record outside the caller's scope returns 404, not 403, so its existence doesn't leak.
- **Multi-step changes use `prisma.$transaction`** and write their audit record inside the same transaction: employee creation, leave approval, payroll approval, salary revision, bulk attendance, import.
- **Soft deletes** for employees, users, departments and designations. Payroll, payslips and audit logs are never deleted.

## API shape

Base URL `/api/v1`. Success: `{ success: true, data }`, or `{ success: true, data: [], pagination: { page, limit, total, totalPages } }` for lists. Failure: `{ success: false, message, code, details? }`. Validation errors come back as 422 with `details: [{ path, message }]`.

Main groups: `/auth`, `/me` (self-service), `/employees`, `/departments`, `/designations`, `/documents`, `/attendance`, `/shifts`, `/holidays`, `/leave/{types,requests,balances,calendar,dashboard}`, `/salary-components`, `/salary-structures`, `/payroll-adjustments`, `/tax-rules`, `/payroll`, `/payslips`, `/reports/:category/:key`, `/notifications`, `/audit-logs`, `/users`, `/roles`, `/organisations`, `/settings`, `/dashboard`, `/public/enquiries`.

List and report endpoints accept `?format=csv|xlsx|pdf` and stream a file instead of JSON.

## Authentication flow

1. `POST /auth/login` returns an access token (JWT, 15 min) in the body and sets `sprasa_rt` (HTTP-only refresh cookie, path `/api/v1/auth`) and `sprasa_csrf` (readable).
2. The SPA keeps the access token in memory and sends `Authorization: Bearer`.
3. On a 401 the SPA calls `POST /auth/refresh` with `X-CSRF-Token` set to the CSRF cookie value. The server rotates the refresh token. A token that was already rotated revokes its whole family.
4. Each request reloads the user, role and permissions from the database, so disabling an account or changing a role takes effect right away. Tokens issued before a password change are rejected.

## Payroll

`payroll.service.calculateItems` gathers, for each employee employed during the month:

- the salary record effective in the month, and its component lines
- attendance (present, half days, absences, overtime minutes)
- approved leave split into paid and unpaid days, counted with the organisation's weekend and holiday settings
- the month's one-off adjustments
- tax slabs effective at the month end for the employee's tax category

Then it calls `calculatePayroll()`:

```text
daily rate          = basic ÷ working days (or calendar days, per settings)
unpaid deduction    = daily rate × (unpaid leave + absences + days outside employment)
overtime            = hours × (basic ÷ (working days × shift hours)) × multiplier
gross               = basic + allowances + overtime + one-off earnings
taxable (monthly)   = taxable earnings − unpaid deduction − min(retirement × 12, cap, % of gross) ÷ 12
tax (monthly)       = progressive slabs on taxable × 12, ÷ 12
net                 = gross − (unpaid + PF/SSF/CIT + other + one-off deductions + tax)
```

Every payroll item stores a snapshot (name, department, bank, figures, component lines and the tax breakdown), so payslips don't change when someone's record changes later. `Payroll.periodKey` (`YYYY-MM`) is unique per organisation while a run is live and cleared on cancel. That blocks duplicate runs without deleting history.

Status: `PROCESSING` (during calculation) → `DRAFT` → `REVIEWED` → `APPROVED` (locked, payslips issued) → `PAID`. `CANCELLED` is allowed from anything but `PAID`. Each transition re-reads the status inside the transaction, so two people clicking at once can't both succeed.

## Leave

Balances are per employee, leave type and calendar year: `entitled + carriedForward + adjusted − used − pending`. Applying reserves days in `pending`. Approval moves them to `used`, and rejection or cancellation releases them. The first year is pro-rated by joining month. On 1 January a job creates the new year's balances with carry-forward capped by the leave type.

A request crossing into a new year must be split, which keeps balance accounting simple.

## Adding a notification channel

Implement `NotificationChannel` in `services/notification.service.ts` and push it onto `channels`. Every `notify()` call then reaches it. Failures in one channel are logged and don't affect the others or the business action.

## Localisation

UI strings for navigation and common actions are in `frontend/src/i18n/{en,ne}.json`. English is complete and Nepali is started. The data model stores Gregorian dates. Bikram Sambat display can be added in the frontend formatting helpers (`lib/utils.ts`) without schema changes.

## Frontend layout

```text
frontend/src/
├── components/ui        Button, form controls, Card/Badge/Stat, Dialog/Drawer/Confirm, Tabs, Dropdown
├── components/common    DataTable (table on desktop, cards on phones), filters, export menu, charts, pickers
├── features/<module>    one folder per area, lazy-loaded per page
├── layouts              AppLayout (sidebar, top bar, mobile tab bar), PublicLayout
├── lib                  api client, auth and theme providers, formatting, mutation helper
└── pages                public site and auth pages
```

Design tokens (colours, fonts) are CSS variables in `index.css`, redefined under `.dark`. Money and IDs use IBM Plex Mono / tabular figures so columns line up.
