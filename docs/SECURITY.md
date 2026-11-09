# Security and privacy baseline

## Implemented baseline

- bcrypt password hashing.
- HTTP-only, SameSite=Strict cookie; Secure flag in production.
- JWT verification and active-account check.
- Password reset tokens hashed, short-lived and one-time.
- Password change invalidates older JWT sessions using `passwordChangedAt`.
- Case access checks based on active assignment or admin/supervisor role.
- Tracking token hashed at rest and required for public report tracking.
- Helmet security headers and CORS origin allowlist.
- Audit events for authentication, organisation submission/approval, role/status changes and case assignment.

## Required before real election data

1. Independent threat model and penetration test.
2. Privacy impact assessment and lawful basis / consent review.
3. Strong production secrets in a managed vault; no sample credentials.
4. HTTPS, secure database networking, encryption at rest and encrypted backups.
5. Distributed rate limits, bot defence, anomaly detection and abuse response.
6. MFA and verified email for privileged accounts.
7. Field-level protection for reporter identities and sensitive locations.
8. Documented data retention, deletion, access request and breach response procedures.
9. Independent oversight and safe referrals for cases involving response institutions.
10. Tested incident response and disaster recovery.

Do not promise absolute anonymity. Network operators, devices, browser state and hosting infrastructure may create metadata. Give reporters accurate safety information.
