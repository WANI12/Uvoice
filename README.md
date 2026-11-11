# SautiWatch South Sudan

SautiWatch is an election early-warning and response MVP for community reporters, journalists, civil society monitors, analysts and authorised response institutions. It supports the pre-election, election-day and post-election phases.

## Included in this release

- Username **or** email login, password hashing, account registration and session authentication.
- HTTP-only session cookie (with bearer-token support for trusted API clients), logout and password reset.
- SMTP password-reset email support; development-only reset token when SMTP is not configured.
- Role-based API restrictions and administrator role/status management.
- Organisation registration, pending approval queue and administrator approval.
- Public report submission with identified, confidential or anonymous reporting modes.
- Unique report and case references; private one-time tracking token for secure status lookup.
- Automatic case creation for each submitted report, initial risk flag for imminent threats and status history.
- Assignment to a user or organisation, assigned-case access checks, response actions and status updates.
- Situation-room dashboard with report, open-case, critical-case and triage metrics.
- Public website, reporting page, account pages, resources and administration interface.
- PostgreSQL / Prisma schema, Docker Compose database, seed script and API documentation.

## Important deployment and safety notice

This is a development MVP, not a certified election-management, emergency-dispatch or high-risk case-management system. Do not enter real survivor identities, witness details, precise sensitive locations or confidential election incidents until a security review, privacy impact assessment, safeguarding review, operational referral agreements and production hardening are complete.

The current release does **not** yet include SMS/USSD, mobile push, evidence-file uploads, MFA, email verification, fully automated SLA timers, offline sync, independent case appeals, or production-grade rate limiting. These remain subsequent development work. The risk classification and response routing are starter rules and require local validation.

## Requirements

- Node.js 20 or 22 LTS
- npm 10+
- Docker Desktop with Docker Compose
- PostgreSQL is started by Docker Compose

## Windows setup

Open PowerShell in the extracted project folder:

```powershell
Copy-Item .env.example .env
# Edit .env and set a long random JWT_SECRET and a unique SEED_ADMIN_PASSWORD.
docker compose up -d
npm install
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

Open:

- Public website: http://localhost:3000
- Sign in: http://localhost:3000/login
- Submit a report: http://localhost:3000/report
- Situation room: http://localhost:3000/dashboard
- Administration: http://localhost:3000/admin
- API health: http://localhost:4000/api/v1/health

The seed administrator is configured by `SEED_ADMIN_USERNAME`, `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env`. Change the password immediately and never use the sample development password in a shared or production environment.

## Password recovery

For development, if SMTP is not configured, `/auth/forgot-password` returns a development-only reset token in its response. In production, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM`. Password-reset tokens expire after 30 minutes and are stored as hashes.

## API overview

Base URL: `http://localhost:4000/api/v1`

| Method | Endpoint | Access |
|---|---|---|
| POST | `/auth/register` | Public |
| POST | `/auth/login` | Public; sets HTTP-only cookie |
| POST | `/auth/logout` | Session |
| POST | `/auth/forgot-password` | Public |
| POST | `/auth/reset-password` | Public, one-time token |
| GET | `/auth/me` | Session |
| POST | `/reports` | Public for anonymous/confidential; session required for identified |
| GET | `/reports/mine` | Session; own reports |
| GET | `/reports/:reference?token=...` | Private tracking token required |
| POST | `/organizations` | Session |
| GET | `/organizations/mine` | Session |
| GET | `/organizations/pending` | Admin/supervisor |
| PATCH | `/organizations/:id/approve` | Admin/supervisor |
| GET | `/dashboard/summary` | Admin, supervisor, analyst, auditor, response officer |
| GET | `/cases` | Session; assigned cases unless admin/supervisor |
| GET | `/cases/:id` | Assigned user/org or admin/supervisor |
| POST | `/cases/:id/actions` | Assigned user/org or admin/supervisor |
| POST | `/cases/:id/assign` | Admin/supervisor |
| POST | `/cases/:id/status` | Assigned responder or admin/supervisor |
| GET | `/admin/users` | Admin |
| PATCH | `/admin/users/:id/role` | Admin |
| PATCH | `/admin/users/:id/status` | Admin |

The browser uses HTTP-only, SameSite cookies. API clients may alternatively send `Authorization: Bearer <JWT>` where explicitly supported. Do not store production access tokens in browser local storage.

## Database and migrations

The Prisma schema is in `packages/database/prisma/schema.prisma`. For local development use `npm run db:migrate -- --name <migration-name>`. For deployment use `npm run db:deploy` after reviewing and testing migrations in staging.

## Production checklist

1. Set `NODE_ENV=production`, a high-entropy `JWT_SECRET` (32+ characters), production `DATABASE_URL` and exact `WEB_ORIGIN`.
2. Configure SMTP and verify password-reset delivery and domain alignment.
3. Use HTTPS end-to-end and secure database/object-storage networking.
4. Replace development database credentials; use a managed secret store.
5. Add distributed API rate limiting, bot mitigation and abuse monitoring.
6. Conduct independent penetration testing and privacy impact assessment.
7. Define approved referral organisations, duty rosters, response SLAs and out-of-hours procedures.
8. Configure backups, retention/deletion schedules, monitoring and tested recovery.
9. Add MFA for privileged users and verified organisation onboarding.
10. Conduct field usability, accessibility, language and low-connectivity testing.

## Project structure

```text
apps/api       NestJS REST API
apps/web       Next.js public website and secure portal
packages/database  Prisma schema and seed
 docs          Product, API, security, operations and test documentation
```

## License and governance

This starter does not grant permission to use third-party brands, datasets, imagery or election-observation materials. Before public launch, agree ownership, governance, neutrality safeguards, data controller/processor responsibilities and applicable legal obligations with participating stakeholders.


## Phase 2 – Operational Intelligence

Phase 2 adds analyst risk assessments, report verification, case escalation, operational analytics, an interactive South Sudan state/county GIS map with geographic filters and grouped incident hotspots, privacy-minimised incident map points, and GeoJSON export for QGIS. Phase 2.3 adds a case-management workspace for triage, verification evidence, assignment deadlines, response actions, escalation and supervisor-led closure/reopening review. Map access is restricted to authorised operational roles; hotspot locations are approximate and grouped into roughly 20 km cells. Boundary data is geoBoundaries South Sudan 2020 ADM1/ADM2, CC BY 3.0 IGO. See [docs/PHASE2.md](docs/PHASE2.md) for endpoint details, scoring method, role access and operational safeguards. The GIS map is available on `/operations` and case workspaces on `/cases`.
