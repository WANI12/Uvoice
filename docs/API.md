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
- `GET /cases` — assigned cases; admin/supervisor see all.
- `GET /cases/:id` — assigned case detail.
- `POST /cases/:id/actions` `{actionType,description}`.
- `POST /cases/:id/assign` `{userId? ,organizationId?}` — admin/supervisor.
- `POST /cases/:id/status` `{status,reason?}` — assigned response officer or admin/supervisor.

## Administration

- `GET /admin/users` — admin.
- `PATCH /admin/users/:id/role` `{role}` — admin.
- `PATCH /admin/users/:id/status` `{status}` — admin.

All endpoints should be called over HTTPS in production. Use cookie credentials from the web app. Trusted API clients may use bearer JWTs. A future release should add OpenAPI/Swagger, DTO classes, pagination contracts and standardized error codes.
