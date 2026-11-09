# Test plan

## Manual acceptance tests

1. Register a user with username, email and 12+ character password.
2. Sign in with username; sign out; sign in with email.
3. Reject wrong password and inactive account.
4. Request password reset; confirm development token or SMTP email; reset once; reject reuse and expiry.
5. Confirm prior session is invalidated after password reset.
6. Submit anonymous report without a session; confirm no reporter account is linked.
7. Submit confidential report while signed in; confirm reporter identity is not in public tracking response.
8. Submit identified report without a session; expect rejection; submit with a session; expect acceptance.
9. Confirm report reference and one-time tracking token are returned; token is not stored in plaintext.
10. Track report with wrong token; expect rejection; correct token returns limited status data.
11. Confirm every report creates exactly one case and initial history event.
12. Create organisation request; confirm inactive; approve as admin; reject approval as reporter.
13. Assign a case to a response user or organisation; confirm unrelated reporter cannot read it.
14. Record action and status transition as assigned responder; reject unassigned responder.
15. Confirm only admin can change roles and user account status.
16. Confirm dashboard denied to reporter role and allowed to authorised roles.
17. Confirm audit records for login, organisation approval, role change and case assignment.
18. Run database migration from an empty PostgreSQL database and seed successfully.
19. Run API and web production builds.
20. Run load, accessibility, penetration and backup restoration tests before launch.

## Current verification

Source syntax transpilation completed without TypeScript/TSX syntax diagnostics. Dependency installation timed out in this execution environment, so application compilation and runtime/database tests remain unverified. Run the full test plan on the target development machine.
