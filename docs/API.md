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

- `GET /dashboard/summary` — authorised analyst, response officer, auditor, supervisor or admin.
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

## Administration

- `GET /admin/users` — admin.
- `PATCH /admin/users/:id/role` `{role}` — admin.
- `PATCH /admin/users/:id/status` `{status}` — admin.

All endpoints should be called over HTTPS in production. Use cookie credentials from the web app. Trusted API clients may use bearer JWTs. A future release should add OpenAPI/Swagger, DTO classes, pagination contracts and standardized error codes.
