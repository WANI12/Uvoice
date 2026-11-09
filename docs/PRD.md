# Product requirements — SautiWatch

## Product goal

Provide a secure, politically neutral and accessible early-warning intake and response coordination system for election-related risks across pre-election, election-day and post-election periods in South Sudan.

## Users

Community reporters, journalists, CSO monitors, field verifiers, analysts, response officers, organisation coordinators, supervisors, administrators and auditors.

## MVP scope

Authentication, role restrictions, organisation onboarding/approval, incident reporting, reference generation, case creation, assigned-case workflows, response action history, basic situation-room metrics and public information pages.

## Out of scope for this MVP

Automated SMS/USSD, push notifications, attachments, full offline sync, automated SLA workers, production GIS, advanced predictive analytics and emergency dispatch.

## Key acceptance outcomes

1. User can register and sign in using username or email.
2. Password reset uses expiring single-use tokens; production delivery requires SMTP.
3. Administrator can manage user roles and account status.
4. Organisation request remains inactive until approved.
5. Anonymous/confidential reports can be submitted without login; identified mode requires login.
6. Every accepted report gets a unique reference and private tracking token.
7. Each report creates a case and a status history record.
8. Case content is accessible only to assigned users/organisations and administrators/supervisors.
9. Assigned responders can record actions and allowed status transitions.
10. Authorised situation-room users can see aggregate metrics and recent report metadata.

## Neutrality and safeguarding

A report is an allegation or warning, not a verified finding. Peaceful political speech, criticism, lawful assembly and opposition activity must not be scored as threats merely because they are politically sensitive. Human review is required. Sensitive referrals must follow survivor-centred and do-no-harm protocols.
