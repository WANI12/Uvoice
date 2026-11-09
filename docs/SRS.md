# Software requirements specification

## Interfaces

- Public web interface at the Next.js origin.
- Secure portal using same-site HTTP-only session cookies.
- REST API under `/api/v1`.
- PostgreSQL relational storage through Prisma.

## Authentication requirements

- Case-insensitive username/email login.
- Password minimum 12 characters; bcrypt cost factor 12 in this MVP.
- HTTP-only, SameSite=Strict session cookie; Secure in production.
- Password reset tokens are SHA-256 hashed in storage, expire after 30 minutes and are one-time use.
- Password reset updates `passwordChangedAt` so older JWT sessions are rejected.

## Authorization requirements

- Public access only to registration, login, password recovery, report intake in allowed modes and token-protected report tracking.
- Organisation request and own report list require a session.
- Admin-only user-role/status changes.
- Admin/supervisor organisation approval and case assignment.
- Case read/action/status restricted to assigned users or members of the assigned organisation; admin/supervisor can oversee all cases.
- Situation-room aggregate dashboard limited to authorised operational roles.

## Reporting requirements

- Valid phase, source type, reporter mode, category and 20-character minimum narrative.
- Identified reports require authentication.
- Anonymous reports do not store the account ID.
- Tracking token is returned once and only its hash is stored.
- Every report creates a linked case and initial history event in one database transaction.

## Reliability and privacy

- Store timestamps in UTC.
- Never expose reporter identity in public tracking responses.
- Never expose raw tracking tokens after submission.
- Keep evidence in private object storage when file support is added.
- Audit role changes, organisation approval, assignment and login events.
