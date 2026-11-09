# SautiWatch Phase 2 – Operational Intelligence

## Included in this increment

### 1. Geographic incident data
- `GET /api/v1/operations/map-points` returns a privacy-minimised coordinate feed for authorised operational roles.
- Optional `phase` and `state` filters are supported.
- `GET /api/v1/operations/geojson` returns the same points as a GeoJSON FeatureCollection for QGIS and other GIS software.
- Reporter names, contact details, full narrative descriptions and tracking tokens are never included in the map feed.
- The web page is available at `/operations` for ADMIN, SUPERVISOR, ANALYST, AUDITOR, RESPONSE_OFFICER and FIELD_VERIFIER roles.

### 2. Transparent analyst risk assessment
- `POST /api/v1/cases/:id/risk-assessment`
- JSON body: `{ "severity": 1, "likelihood": 1, "impact": 1, "rationale": "..." }`
- Each factor is an integer from 1 to 5; rationale must contain at least 10 characters.
- Weighted score: severity 40%, likelihood 35%, impact 25%. Score is stored on the existing `riskScore` decimal field (0–9.96 due to the existing Decimal(3,2) schema); risk bands are LOW, MODERATE, HIGH and CRITICAL.
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

## Apply and run

No database schema change is required for this increment. Replace the source files with this Phase 2 package, then from the project root run:

```powershell
npm install
npm run db:generate
npm run build
npm run dev
```

If you already have the dependencies installed, `npm install` is not normally necessary. Use `npm run db:generate` after any Prisma schema change; this Phase 2 increment does not change the Prisma schema.

## Operational and security notes

- Map and analytics endpoints are authenticated and role-restricted.
- Only reports with supplied latitude and longitude appear in the geographic feed.
- Location data may itself be sensitive. Restrict access, avoid public map sharing, and consider coordinate generalisation for small communities or vulnerable sources before production.
- The current dashboard provides a tabular geospatial feed and GeoJSON export, not a live tile-based interactive map. A full Leaflet/MapLibre map and GIS boundary layers are a subsequent frontend increment.
- Notification delivery, scheduled SLA monitoring, SMS/USSD, offline sync, file evidence scanning, and independent security testing remain future production-hardening tasks.
