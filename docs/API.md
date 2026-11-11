# API reference

Base: `/api/v1` — JSON request and response bodies.

## Authentication

- `POST /auth/register` `{username,email,displayName,password}`
- `POST /auth/login` `{identifier,password}`; sets `sw_session` HTTP-only cookie.
- `POST /auth/logout`; clears session cookie.
- `GET /auth/me`; current authenticated account.
- `POST /auth/forgot-password` `{identifier}`.
- `POST /auth/reset-password` `{token,password}`.

## Reports

- `GET /reports/schema` — allowed phase, source and reporter-mode values.
- `POST /reports` — `{electoralPhase,category,description,sourceType,reporterMode,occurredAt?,imminentThreat?,location?}`.
- `GET /reports/mine` — own reports.
- `POST /reports/:reference/track` with `{token}` in the JSON body — status tracking; both reference and token required.

Accepted report response includes `reference`, `trackingToken` (one-time display), `caseReference`, `reportId` and status. Keep the tracking token private.

## Organisations

- `POST /organizations` — authenticated request `{name,slug?,description?,contactEmail?,contactPhone?}`.
- `GET /organizations/mine` — own memberships.
- `GET /organizations/pending` — admin/supervisor.
- `PATCH /organizations/:id/approve` — admin/supervisor.

## Situation room and cases

- `GET /dashboard/summary` — authorised analyst, response officer (assigned cases only), auditor, supervisor, admin or executive (aggregate summary only).
- `GET /cases` — assigned cases; analysts, auditors, supervisors and admins see the operational queue. Verifiers and response officers see assigned cases.
- `GET /cases/:id` — assigned case detail; analysts, auditors, supervisors and admins may view the operational queue, while verifiers and response officers require an active assignment.
- `GET /cases/assignment-options` — active authorised officers and institutions; supervisor/admin.
- `POST /cases/:id/actions` `{actionType,description}` — assigned response officer or supervisor/admin. Action types: `ACTION_TAKEN`, `PROGRESS_UPDATE`, `CONTACT_ATTEMPT`, `REFERRAL`, `NOTE`.
- `POST /cases/:id/assign` `{userId? ,organizationId?,dueAt?}` — exactly one active authorised officer or institution; supervisor/admin. Optional `dueAt` is an ISO 8601 date-time.
- `POST /cases/:id/status` `{status,reason?}` — assigned response officer or supervisor/admin. Resolution must first be set to `RESOLVED_PENDING_REVIEW`; only supervisor/admin may close or reopen, with a review reason of at least 10 characters.
- `POST /cases/:id/risk-assessment` `{severity,credibility,urgency,impact,rationale}` — authorised analyst, field verifier, supervisor or admin. Factors are 1–5; rationale is at least 10 characters. Legacy requests with `likelihood` retain their original score weights.
- `POST /cases/:id/escalate` `{level,reason}` — authorised assigned response personnel, analyst, supervisor or admin.
- `POST /reports/:id/verify` `{decision,confidence,evidenceSummary,sources,rationale}` — authorised verification role. Confidence is 0–100; evidence and source details are persisted with the verification record.

The case workspace is available at `/cases`; details and lifecycle actions are at `/cases/:id`.

## Automated early warning

- `GET /early-warning/alerts?status=OPEN` — authorised analyst, supervisor, admin or auditor.
- `POST /early-warning/run` — supervisor/admin; run a rule scan on demand.
- `POST /early-warning/alerts/:id/acknowledge` — analyst, supervisor or admin.
- `POST /early-warning/alerts/:id/dismiss` `{reason}` — analyst, supervisor or admin; reason must be at least 10 characters and is audited.
- `GET /early-warning/bulletins/daily` or `/early-warning/bulletins/weekly` — retrieve the current aggregate bulletin, creating it if needed.
- `POST /early-warning/bulletins/daily/generate` or `/early-warning/bulletins/weekly/generate` — refresh and persist the aggregate bulletin snapshot.

The rule scan runs every minute by default. It creates deduplicated alerts for repeated county/category reports (3 in 24 hours), county concentrations (5 in 24 hours), unresolved critical cases, recent case escalations, and overdue assigned high/critical cases. Thresholds and scan cadence are configurable with `EARLY_WARNING_*` environment variables. Email delivery uses the existing SMTP settings; alerts remain available in-app when SMTP is not configured. Signals are not verified findings and never include reporter identity, narrative descriptions or tracking tokens.

## Phase 2.5 analytics and executive intelligence

- `GET /analytics/overview?from=...&to=...&phase=...&state=...&county=...&bucket=day|week|month` — live report, verification, geographic, case, response-performance and early-warning aggregates. Dates are ISO 8601; the default is the latest 30 days and ranges are capped at 366 days. County filters require a state.
- `GET /analytics/executive?...` — restricted aggregate intelligence, priority incident references and approved strategic recommendations; ADMIN, SUPERVISOR, ANALYST or EXECUTIVE.
- `GET /analytics/recommendations` — analyst/supervisor/auditor access to the review queue; EXECUTIVE receives approved recommendations only.
- `POST /analytics/recommendations` `{title,rationale,action,stateCode?,countyCode?}` — submit a pending recommendation; ANALYST, SUPERVISOR or ADMIN.
- `PATCH /analytics/recommendations/:id/review` `{decision:"APPROVED"|"REJECTED",notes}` — independently review and audit a pending recommendation; a user cannot review their own submission.
- `GET /analytics/reports/:kind` — downloadable CSV. Supported kinds: `daily`, `weekly`, `monthly`, `state`, `county`, `critical`, `response`. State reports require `state`; county reports require `state` and `county`. Period and geography filters are supported.

The analytics API reads PostgreSQL records directly; it does not keep manually maintained dashboard totals. Counts are based on report submission time and selected filters; verification counts reflect current report status. Response time is assignment-to-acknowledgement, while the resolution rate is closed cases divided by cases created in the selected period. Downloads include their data sources, reporting period, verification interpretation, methodology and limitations. They are aggregate CSVs; critical briefings include case/report references and limited classification/location fields, not reporter identity or narrative descriptions.

Role access: ADMIN, SUPERVISOR and ANALYST have operational analytics and recommendation workflow access; AUDITOR is read-only; RESPONSE_OFFICER analytics are limited to actively assigned cases; EXECUTIVE sees restricted aggregates and approved recommendations. Assign the EXECUTIVE role through administrator user management.

## Administration

- `GET /admin/users` — admin.
- `PATCH /admin/users/:id/role` `{role}` — admin.
- `PATCH /admin/users/:id/status` `{status}` — admin.

All endpoints should be called over HTTPS in production. Use cookie credentials from the web app. Trusted API clients may use bearer JWTs. A future release should add OpenAPI/Swagger, DTO classes, pagination contracts and standardized error codes.
