# UVoice Phase 2 – Operational Intelligence

## Included in this increment

### 1. Geographic incident data
- `GET /api/v1/operations/map-points` returns a privacy-minimised coordinate feed for authorised operational roles.
- Optional `phase`, `state` and `county` filters are supported.
- `GET /api/v1/operations/geojson` returns the same points as a GeoJSON FeatureCollection for QGIS and other GIS software.
- Reporter names, contact details, full narrative descriptions and tracking tokens are never included in the map feed.
- The web page is available at `/operations` for ADMIN, SUPERVISOR, ANALYST, AUDITOR, RESPONSE_OFFICER and FIELD_VERIFIER roles.
- The interactive map includes geoBoundaries South Sudan 2020 ADM1 state and ADM2 county outlines, area report shading, grouped incident hotspots, and state/county/category/risk filters. Boundary GeoJSON is from [geoBoundaries](https://www.geoboundaries.org/), sourced from South Sudan IMWG, National Bureau of Statistics and OCHA, under CC BY 3.0 IGO.

### 2. Transparent analyst risk assessment
- `POST /api/v1/cases/:id/risk-assessment`
- Phase 2.3 body: `{ "severity": 1, "credibility": 1, "urgency": 1, "impact": 1, "rationale": "..." }`
- Each factor is an integer from 1 to 5; rationale must contain at least 10 characters. Legacy requests containing only `likelihood` remain accepted and retain the original score weights (severity 40%, likelihood 35%, impact 25%).
- Weighted score: severity 30%, credibility 25%, urgency 25%, impact 20%. Score is stored on the existing `riskScore` decimal field (0–9.96 due to the existing Decimal(3,2) schema); risk bands are LOW, MODERATE, HIGH and CRITICAL.
- This is decision support only. Human analysts remain responsible for contextual assessment and escalation decisions. Do not use the score as an automated prediction of violence or as the sole basis for action.

### 3. Report verification
- `POST /api/v1/reports/:id/verify`
- JSON body: `{ "decision": "VERIFIED", "confidence": 80, "rationale": "..." }`
- Decision values: VERIFIED, UNVERIFIED, INCONCLUSIVE, NEEDS_MORE_INFORMATION.
- Confidence is optional and must be 0–100. Each review is stored with reviewer, timestamp, decision and rationale. The report status is updated and linked case activity is recorded.

### 4. Case escalation
- `POST /api/v1/cases/:id/escalate`
- JSON body: `{ "level": 1, "reason": "..." }`
- Escalation levels 1–3. Reason must contain at least 10 characters.
- Escalation, case status history, case activity and audit event are recorded together in a database transaction.

### 5. Analytics
- `GET /api/v1/operations/analytics` returns reporting breakdowns by state/administrative area, category, case risk, case status, county and daily reports over the last 30 days.
- Analytics access is restricted to authorised operational roles.

## Phase 2 baseline setup

The initial Phase 2 increment did not change the database schema. Phase 2.3 adds a migration for case deadlines and structured verification evidence/source notes. From the project root, apply the migrations and rebuild:

```powershell
npm run db:deploy
npm run db:generate
npm run build
```

Run `npm run dev` after the migration and build. In local development, `npm run db:migrate -- --name case_response_operations` can be used to apply the pending schema migration interactively.

## Operational and security notes

- Map and analytics endpoints are authenticated and role-restricted.
- Only reports with supplied latitude and longitude appear in the geographic feed.
- Location data may itself be sensitive. Restrict access, avoid public map sharing, and consider coordinate generalisation for small communities or vulnerable sources before production.
- The interactive map groups nearby reports into approximate 20 km cells and does not display precise incident coordinates. Access remains restricted to authorised operational roles; review local privacy requirements before production use.
- SMS/USSD, offline sync, file evidence scanning, and independent security testing remain future production-hardening tasks.

## Phase 2.3 – Case Management & Response Operations

The case workspace at `/cases` and `/cases/:id` supports the operational lifecycle:

1. **Incident received** — report submission creates a linked case and initial status history.
2. **Triage and risk assessment** — authorised analysts record severity, credibility, urgency and potential impact (1–5) with a rationale. The transparent decision-support score weights these factors 30%, 25%, 25% and 20%; it is not an automated prediction.
3. **Verification** — authorised reviewers record a finding, confidence (0–100), evidence summary, sources and rationale against each report.
4. **Assignment and escalation** — supervisors/admins assign a case to one active response officer or approved institution and set an optional deadline. Escalations retain their level and reason in the case record.
5. **Response tracking** — assigned response personnel log actions, contact attempts, referrals and progress; assignment, status and action histories remain visible in the case timeline.
6. **Resolution and review** — responders move a case to `RESOLVED_PENDING_REVIEW`. A supervisor/admin must provide a review reason to close it or reopen it.

The schema migration adds optional assignment deadlines and structured verification evidence/source fields. Apply migrations with `npm run db:deploy` in deployment environments or `npm run db:migrate -- --name case_response_operations` in development, then regenerate the Prisma client and build.

Role controls: only supervisors/admins assign, set closure/reopening decisions or access assignment options. Analysts and auditors can access the operational queue; field verifiers, response officers and organisation coordinators are restricted to assigned cases. Avoid placing reporter identity or unnecessary personal data in verification notes and action logs.

## Phase 2.4 – Automated Early Warning Engine

The authorised `/warnings` workspace presents deduplicated signals and generated daily/weekly bulletins. The API under `/api/v1/early-warning` supports alert review, supervisor-triggered scans and bulletin generation. A background scan runs every minute by default; set `EARLY_WARNING_INTERVAL_MS` to change the cadence (minimum 15 seconds, maximum 1 hour).

Default deterministic rules evaluate a rolling 24-hour report window:

- Three or more reports with the same state, county and category create a repeated-pattern alert.
- Five or more reports in one state/county create a geographic-concentration alert.
- Unresolved critical cases and case escalations create immediate-review alerts.
- Missed deadlines for unresolved high/critical cases create alerts for supervisors and the assigned officer or institution members.

Set `EARLY_WARNING_WINDOW_HOURS` (1–168), `EARLY_WARNING_REPEAT_THRESHOLD` (2–100), and `EARLY_WARNING_CONCENTRATION_THRESHOLD` (2–100) to tune rule thresholds. Rule fingerprints prevent duplicate alerts for the same case/escalation/deadline or repeated pattern during the same UTC day. Each alert and notification delivery outcome is persisted; acknowledgements and dismissals are audit logged. SMTP delivery reuses `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM`. If SMTP is unavailable, authorised staff can still review in-app alerts; failed configured deliveries are logged and recorded.

Bulletins are structured aggregate snapshots persisted by UTC day or week. They include counts, top categories/locations, case risk/status distributions and safeguards, but exclude reporter identity, report narratives, tracking tokens and precise coordinates. All rule matches are preliminary signals: staff must check for duplicate reports and verify context before deciding whether to escalate or act.

Apply the Phase 2.4 migration with `npm run db:deploy`, then run `npm run db:generate` and rebuild. Local development may use `npm run db:migrate -- --name automated_early_warning`.

## Phase 2.5 – National Situation-Room Analytics & Executive Intelligence

The `/analytics` workspace and `/api/v1/analytics/overview` calculate aggregates directly from PostgreSQL for the selected reporting period, electoral phase and state/county. The dashboard covers reports received, critical unresolved incidents, open cases, verified/unverified/inconclusive reports, phase comparisons, daily/weekly/monthly trends, state/county comparisons, response acknowledgement times, overdue assignments, resolution rates, early-warning trends, priority incidents and assignment performance. Metrics are live aggregates, not manually maintained figures.

The separate `/executive` workspace is restricted to executive-role users and authorised national leadership roles. It presents national risk and response summaries, priority incident references with limited classifications/location, institution performance, emerging geography and analyst-approved recommendations. It does not expose report narratives or reporter identities. The EXECUTIVE account role can be assigned only by an administrator.

Analysts and supervisors can submit strategic recommendations with evidence-based rationale, proposed actions and optional geographic scope. Approval or rejection requires review notes and an independent reviewer; authors cannot review their own recommendations. Recommendation submissions and decisions are audit logged. Executives receive approved recommendations only.

Downloadable CSVs are available for daily situation reports, weekly early-warning bulletins, monthly risk assessments, state and county reports, critical incident briefings, and response-performance reports. Each export states its sources, reporting period, verification interpretation, methodology and limitations. Exports contain aggregate figures; critical-incident rows include case/report references and limited risk, status, phase and location fields, but exclude reporter identity, report narratives and tracking credentials. CSV values are escaped to reduce spreadsheet formula-injection risk.

Metric definitions and access:

- Reports received and verification outcomes use `Report.submittedAt` and current report status in the selected range.
- Open/critical cases are linked to reports matching the selected filters and are not closed; resolved-pending-review cases remain outstanding.
- Average response time is assignment-to-acknowledgement. Overdue assignment and resolution-rate metrics use active assignments and cases created in the period, respectively.
- ADMIN, SUPERVISOR and ANALYST have operational analytics; AUDITOR is read-only. RESPONSE_OFFICER analytics are scoped to active assignments. EXECUTIVE access is restricted to aggregate executive summaries and approved recommendations.
- A county filter requires a state. Analytics periods are capped at 366 days. Missing/inconsistent administrative locations limit geographic comparisons. Trends are descriptive and automated alerts remain unverified recommendations.

The additive Phase 2.5 migration adds the EXECUTIVE account role and persists recommendation review status. Apply all pending migrations, including Phase 2.4, and regenerate the Prisma client:

```powershell
npm run db:deploy
npm run db:generate
npm run build
```

Analytics is available at `/analytics`; the executive dashboard is at `/executive`.
