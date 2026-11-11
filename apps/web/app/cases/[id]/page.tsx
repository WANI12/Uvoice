'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type User = { id: string; displayName: string; role: string };
type Organization = { id: string; name: string };
type Verification = {
  id: string;
  decision: string;
  confidence: number | null;
  evidenceSummary: string | null;
  sources: string | null;
  rationale: string;
  createdAt: string;
  reviewer: { displayName: string; role: string };
};
type Report = {
  id: string;
  reference: string;
  phase: string;
  category: string;
  description: string;
  occurredAt: string | null;
  stateCode: string | null;
  countyCode: string | null;
  locality: string | null;
  imminentThreat: boolean;
  sourceType: string;
  reporterMode: string;
  status: string;
  submittedAt: string;
  verifications: Verification[];
};
type CaseRecord = {
  id: string;
  reference: string;
  title: string;
  summary: string;
  status: string;
  riskLevel: string;
  riskScore: number | null;
  createdAt: string;
  updatedAt: string;
  reports: { report: Report }[];
  assignments: {
    id: string;
    userId: string | null;
    organizationId: string | null;
    assignedAt: string;
    dueAt: string | null;
    active: boolean;
    user?: { displayName: string } | null;
    organization?: { name: string } | null;
  }[];
  history: { id: string; fromStatus: string | null; toStatus: string; changedById: string | null; reason: string | null; createdAt: string }[];
  actions: { id: string; actionType: string; description: string; createdAt: string; actor: { displayName: string; role: string } }[];
  escalations: { id: string; level: number; reason: string; triggeredAt: string }[];
};
type AssignmentOptions = { users: User[]; organizations: Organization[] };
type SessionUser = { id: string; role: string; displayName: string };

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'The request could not be completed.');
  return data as T;
}

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [options, setOptions] = useState<AssignmentOptions>({ users: [], organizations: [] });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [deadline, setDeadline] = useState('');
  const [severity, setSeverity] = useState(3);
  const [credibility, setCredibility] = useState(3);
  const [urgency, setUrgency] = useState(3);
  const [impact, setImpact] = useState(3);
  const [riskRationale, setRiskRationale] = useState('');
  const [actionType, setActionType] = useState('PROGRESS_UPDATE');
  const [actionDescription, setActionDescription] = useState('');
  const [escalationLevel, setEscalationLevel] = useState(1);
  const [escalationReason, setEscalationReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const currentUser = await request<SessionUser>('/auth/me');
      setUser(currentUser);
      const caseRecord = await request<CaseRecord>(`/cases/${id}`);
      setRecord(caseRecord);
      if (['ADMIN', 'SUPERVISOR'].includes(currentUser.role)) {
        setOptions(await request<AssignmentOptions>('/cases/assignment-options'));
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Unable to load case details.';
      if (text.includes('Sign in') || text.includes('session')) location.href = '/login';
      else setError(text);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    path: string,
    body: unknown,
    successText: string,
  ) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await request(path, 'POST', body);
      setMessage(successText);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request could not be completed.');
    } finally {
      setSaving(false);
    }
  }

  const activeAssignment = record?.assignments.find(assignment => assignment.active);
  const supervisor = !!user && ['ADMIN', 'SUPERVISOR'].includes(user.role);
  const assessor = !!user && ['ADMIN', 'SUPERVISOR', 'ANALYST', 'FIELD_VERIFIER'].includes(user.role);
  const verifier = !!user && ['ADMIN', 'SUPERVISOR', 'ANALYST', 'FIELD_VERIFIER', 'AUDITOR'].includes(user.role);
  const responder = !!user && ['ADMIN', 'SUPERVISOR', 'RESPONSE_OFFICER', 'ORG_COORDINATOR'].includes(user.role);
  const mayRespond = responder && (!!activeAssignment || supervisor);
  const mayEscalate = !!user && ['ADMIN', 'SUPERVISOR', 'ANALYST', 'RESPONSE_OFFICER'].includes(user.role) && (supervisor || user.role === 'ANALYST' || !!activeAssignment);
  const nextStatuses = record ? (statusTransitions[record.status] ?? []).filter(status =>
    (!['CLOSED', 'REOPENED'].includes(status) || supervisor) &&
    (mayRespond || status === 'UNDER_VERIFICATION'),
  ) : [];

  return (
    <main className="container case-detail-page" style={{ paddingTop: 32, paddingBottom: 70 }}>
      <header className="dashhead">
        <div><Link href="/" className="brand">◈ UVOICE</Link><p className="muted">National election early warning workspace</p></div>
        <div className="row"><Link className="btn secondary" href="/cases"><ArrowLeft size={16}/> Case queue</Link><Link className="btn secondary" href="/dashboard">Situation room</Link></div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {loading && !record ? <div className="card">Loading case…</div> : record && <>
        <div className="row between case-page-heading">
          <div><div className="eyebrow">CASE WORKSPACE · {record.reference}</div><h1>{format(record.title)}</h1><p className="muted">{record.summary}</p></div>
          <button className="btn secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button>
        </div>
        <section className="case-summary-grid">
          <Summary label="Status"><span className={`case-status status-${record.status.toLowerCase()}`}>{format(record.status)}</span></Summary>
          <Summary label="Risk level"><span className={`case-risk risk-${record.riskLevel.toLowerCase()}`}>{record.riskLevel}{record.riskScore !== null ? ` · ${Number(record.riskScore).toFixed(2)}/10` : ''}</span></Summary>
          <Summary label="Responsible"><strong>{activeAssignment?.user?.displayName || activeAssignment?.organization?.name || 'Unassigned'}</strong></Summary>
          <Summary label="Response deadline"><strong className={activeAssignment?.dueAt && new Date(activeAssignment.dueAt) < new Date() && record.status !== 'CLOSED' ? 'case-overdue' : ''}>{activeAssignment?.dueAt ? new Date(activeAssignment.dueAt).toLocaleString() : 'Not set'}</strong></Summary>
        </section>

        {supervisor && <section className="card case-panel">
          <h2>Assignment &amp; response deadline</h2>
          <p className="muted">Assign to one active response officer or approved institution. Reassignment preserves prior assignment history.</p>
          <form className="case-form-grid" onSubmit={event => {
            const [type, value] = assignee.split(':');
            void submit(event, `/cases/${id}/assign`, {
              ...(type === 'user' ? { userId: value } : { organizationId: value }),
              dueAt: deadline ? new Date(deadline).toISOString() : null,
            }, 'Case assignment and deadline saved.');
          }}>
            <label>Responsible officer or institution
              <select required value={assignee} onChange={event => setAssignee(event.target.value)}>
                <option value="">Select an assignee</option>
                <optgroup label="Authorised officers">{options.users.map(item => <option key={item.id} value={`user:${item.id}`}>{item.displayName} · {format(item.role)}</option>)}</optgroup>
                <optgroup label="Approved institutions">{options.organizations.map(item => <option key={item.id} value={`organization:${item.id}`}>{item.name}</option>)}</optgroup>
              </select>
            </label>
            <label>Response deadline<input type="datetime-local" value={deadline} onChange={event => setDeadline(event.target.value)}/></label>
            <button className="btn" disabled={saving}>Assign case</button>
          </form>
        </section>}

        {assessor && <section className="card case-panel">
          <h2>Triage &amp; risk assessment</h2>
          <p className="muted">Rate severity, source credibility, urgency and potential impact from 1 (lowest) to 5 (highest). The score supports, but does not replace, analyst judgement.</p>
          <form onSubmit={event => void submit(event, `/cases/${id}/risk-assessment`, { severity, credibility, urgency, impact, rationale: riskRationale }, 'Risk assessment recorded.')}>
            <div className="case-form-grid case-risk-fields">
              <Rating label="Severity" value={severity} setValue={setSeverity}/>
              <Rating label="Credibility" value={credibility} setValue={setCredibility}/>
              <Rating label="Urgency" value={urgency} setValue={setUrgency}/>
              <Rating label="Potential impact" value={impact} setValue={setImpact}/>
            </div>
            <label>Assessment rationale<textarea required minLength={10} maxLength={4000} value={riskRationale} onChange={event => setRiskRationale(event.target.value)} rows={3} placeholder="Summarise the basis for the assessment and any uncertainty."/></label>
            <button className="btn" disabled={saving}>Record triage assessment</button>
          </form>
        </section>}

        {record.reports.map(({ report }) => <section className="card case-panel" key={report.id}>
          <div className="row between"><h2>Report {report.reference}</h2><span className="status">{format(report.status)}</span></div>
          <div className="case-report-meta"><span>{format(report.category)}</span><span>{[report.locality, report.countyCode, report.stateCode].filter(Boolean).join(', ') || 'Location not provided'}</span><span>{format(report.phase)}</span><span>Source: {format(report.sourceType)}</span></div>
          {report.imminentThreat && <p className="error">Reported imminent safety threat — follow applicable safeguarding and emergency protocols.</p>}
          <p className="case-report-description">{report.description}</p>
          {report.verifications.length > 0 && <div className="case-verifications"><h3>Verification history</h3>{report.verifications.map(item => <article key={item.id} className="case-log-item">
            <div className="row between"><strong>{format(item.decision)}{item.confidence !== null ? ` · ${item.confidence}% confidence` : ''}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div>
            <p>{item.rationale}</p>
            {item.evidenceSummary && <p><strong>Evidence:</strong> {item.evidenceSummary}</p>}
            {item.sources && <p><strong>Sources:</strong> {item.sources}</p>}
            <small className="muted">Reviewed by {item.reviewer.displayName} · {format(item.reviewer.role)}</small>
          </article>)}</div>}
          {verifier && <VerificationForm report={report} onSaved={load} onError={setError} onMessage={setMessage} caseId={id}/>}
        </section>)}

        {(mayRespond || (assessor && record.status === 'OPEN')) && <section className="card case-panel">
          <h2>Response tracking</h2>
          {mayRespond && <form onSubmit={event => void submit(event, `/cases/${id}/actions`, { actionType, description: actionDescription }, 'Response update recorded.')}>
            <div className="case-form-grid">
              <label>Action type<select value={actionType} onChange={event => setActionType(event.target.value)}>{[['ACTION_TAKEN','Action taken'],['PROGRESS_UPDATE','Progress update'],['CONTACT_ATTEMPT','Contact attempt'],['REFERRAL','Referral'],['NOTE','Case note']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Action, progress or outcome<textarea required minLength={5} maxLength={4000} value={actionDescription} onChange={event => setActionDescription(event.target.value)} rows={3} placeholder="Record what was done, by whom, the outcome and any next steps."/></label>
            </div>
            <button className="btn" disabled={saving}>Record response update</button>
          </form>}
          {(mayRespond || assessor) && nextStatuses.length > 0 && <form className="case-status-form" onSubmit={event => {
            const form = new FormData(event.currentTarget);
            const nextStatus = String(form.get('status'));
            const reason = String(form.get('reason') || '');
            if (['CLOSED', 'REOPENED'].includes(nextStatus) && reason.trim().length < 10) {
              event.preventDefault();
              setError('Supervisor review reason must contain at least 10 characters.');
              return;
            }
            void submit(event, `/cases/${id}/status`, { status: nextStatus, reason }, 'Case status updated.');
          }}>
            <label>Update case status<select name="status" required defaultValue="">{nextStatuses.map(value => <option key={value} value={value}>{format(value)}</option>)}</select></label>
            <label>Reason or progress note<textarea name="reason" rows={2} placeholder="Briefly explain the status change."/></label>
            <button className="btn secondary" disabled={saving}>Update status</button>
          </form>}
        </section>}

        {mayEscalate && !['CLOSED', 'RESOLVED_PENDING_REVIEW'].includes(record.status) && <section className="card case-panel">
          <h2>Escalation</h2>
          <form className="case-form-grid" onSubmit={event => void submit(event, `/cases/${id}/escalate`, { level: escalationLevel, reason: escalationReason }, 'Case escalation recorded.')}>
            <label>Escalation level<select value={escalationLevel} onChange={event => setEscalationLevel(Number(event.target.value))}><option value={1}>Level 1 · Team lead</option><option value={2}>Level 2 · Supervisor</option><option value={3}>Level 3 · Senior response</option></select></label>
            <label>Reason<textarea required minLength={10} value={escalationReason} onChange={event => setEscalationReason(event.target.value)} rows={2}/></label>
            <button className="btn secondary" disabled={saving}>Escalate case</button>
          </form>
        </section>}

        <section className="grid2 case-history-grid">
          <section className="card"><h2>Case timeline</h2>{record.history.length ? record.history.map(item => <article className="case-log-item" key={item.id}>
            <div className="row between"><strong>{item.fromStatus ? `${format(item.fromStatus)} → ` : ''}{format(item.toStatus)}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div>
            {item.reason && <p>{item.reason}</p>}
          </article>) : <p className="muted">No status history recorded.</p>}</section>
          <section className="card"><h2>Response activity</h2>{record.actions.length ? record.actions.map(item => <article className="case-log-item" key={item.id}>
            <div className="row between"><strong>{format(item.actionType)}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div>
            <p>{item.description}</p><small className="muted">{item.actor.displayName} · {format(item.actor.role)}</small>
          </article>) : <p className="muted">No response actions recorded.</p>}</section>
        </section>
        {record.assignments.length > 0 && <section className="card case-panel"><h2>Assignment history</h2><div className="tablewrap"><table><thead><tr><th>Assigned to</th><th>Assigned</th><th>Deadline</th><th>State</th></tr></thead><tbody>{record.assignments.map(item => <tr key={item.id}><td>{item.user?.displayName || item.organization?.name || '—'}</td><td>{new Date(item.assignedAt).toLocaleString()}</td><td>{item.dueAt ? new Date(item.dueAt).toLocaleString() : 'Not set'}</td><td>{item.active ? 'Current' : 'Previous'}</td></tr>)}</tbody></table></div></section>}
      </>}
    </main>
  );
}

const statusTransitions: Record<string, string[]> = {
  OPEN: ['UNDER_VERIFICATION', 'ACKNOWLEDGED', 'ESCALATED'],
  UNDER_VERIFICATION: ['ACKNOWLEDGED', 'AWAITING_INFORMATION', 'IN_PROGRESS', 'ESCALATED'],
  ESCALATED: ['ACKNOWLEDGED', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'RESOLVED_PENDING_REVIEW'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'AWAITING_INFORMATION', 'ESCALATED'],
  IN_PROGRESS: ['AWAITING_INFORMATION', 'RESOLVED_PENDING_REVIEW', 'ESCALATED'],
  AWAITING_INFORMATION: ['IN_PROGRESS', 'RESOLVED_PENDING_REVIEW', 'ESCALATED'],
  RESOLVED_PENDING_REVIEW: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'AWAITING_INFORMATION', 'RESOLVED_PENDING_REVIEW', 'ESCALATED'],
  REFERRED: ['ACKNOWLEDGED', 'IN_PROGRESS', 'ESCALATED'],
};

function VerificationForm({
  report, onSaved, onError, onMessage, caseId,
}: {
  report: Report;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
  caseId: string;
}) {
  const [decision, setDecision] = useState('VERIFIED');
  const [confidence, setConfidence] = useState(70);
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [sources, setSources] = useState('');
  const [rationale, setRationale] = useState('');
  const [saving, setSaving] = useState(false);
  return <form className="case-verification-form" onSubmit={async event => {
    event.preventDefault();
    setSaving(true);
    onError('');
    onMessage('');
    try {
      await request(`/reports/${report.id}/verify`, 'POST', { decision, confidence, evidenceSummary, sources, rationale });
      onMessage(`Verification for ${report.reference} recorded.`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unable to record verification.');
    } finally {
      setSaving(false);
    }
  }}>
    <h3>Record verification</h3>
    <div className="case-form-grid">
      <label>Finding<select value={decision} onChange={event => setDecision(event.target.value)}>{['VERIFIED','UNVERIFIED','INCONCLUSIVE','NEEDS_MORE_INFORMATION'].map(value => <option key={value} value={value}>{format(value)}</option>)}</select></label>
      <label>Confidence: {confidence}%<input type="range" min="0" max="100" step="5" value={confidence} onChange={event => setConfidence(Number(event.target.value))}/></label>
      <label>Evidence summary<textarea required minLength={5} maxLength={4000} value={evidenceSummary} onChange={event => setEvidenceSummary(event.target.value)} rows={2} placeholder="Record relevant evidence without unnecessary personal details."/></label>
      <label>Sources consulted<textarea required minLength={3} maxLength={2000} value={sources} onChange={event => setSources(event.target.value)} rows={2} placeholder="Describe source types or references used for verification."/></label>
      <label>Verification rationale<textarea required minLength={10} maxLength={4000} value={rationale} onChange={event => setRationale(event.target.value)} rows={2}/></label>
    </div>
    <button className="btn secondary" disabled={saving}>{saving ? 'Saving…' : 'Save verification'}</button>
  </form>;
}

function Rating({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) {
  return <label>{label}<select value={value} onChange={event => setValue(Number(event.target.value))}>{[1,2,3,4,5].map(level => <option key={level} value={level}>{level} · {['','Very low','Low','Moderate','High','Very high'][level]}</option>)}</select></label>;
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="card case-summary-item"><small className="muted">{label}</small><div>{children}</div></div>;
}

function format(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}
