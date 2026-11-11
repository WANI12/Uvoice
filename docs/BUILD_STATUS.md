# Build status — UVoice MVP 1.0

## Implemented in source

- Username/email login; bcrypt password hashes; JWT session in HTTP-only cookie.
- Registration, logout, forgot-password and reset-password routes.
- SMTP-based password reset; development token fallback only outside production.
- Password reset token hashing, expiry and one-time use; password change invalidates older JWTs.
- User roles and administrator-only role/status management.
- Organisation registration and approval routes and administrator UI.
- Report intake validation, anonymous/confidential/identified modes, unique reference and private tracking token.
- Automatic case creation and initial status history.
- Assignment to a user or organisation, assigned-case authorization, response action logging and status transitions.
- Situation-room summary API and dashboard UI.
- PostgreSQL schema, Docker Compose, seed administrator and indicator records.

## Not implemented / external configuration required

- SMS/USSD and push notifications.
- Evidence file uploads and malware scanning.
- MFA and email verification.
- Full SLA scheduler / automatic timeout escalation worker.
- GIS mapping, geocoding and boundary datasets.
- Offline/PWA sync.
- Advanced risk scoring and independently validated indicators.
- Production rate limiting, bot defence, WAF and security monitoring.
- Production SMTP credentials and domain configuration.
- End-to-end automated test suite and independent penetration test.

## Verification status

TypeScript/TSX source syntax was checked with the installed TypeScript transpiler and no syntax diagnostics were found. Dependency installation was attempted twice but timed out in this environment, so Prisma generation, database migration, API compilation, Next.js production build, and runtime integration tests could not be completed here. Treat this package as source-complete for the six requested MVP milestones but not as a verified production build. Run the setup and test commands on the target Windows development machine before using it.
