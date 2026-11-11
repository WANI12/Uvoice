'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileDown, RefreshCw } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type CountRow = { phase: string; count: number };
type Overview = {
  generatedAt: string;
  reportingPeriod: { from: string; to: string; bucket: string };
  metrics: {
    reportsReceived: number; criticalIncidents: number; openCases: number; verifiedReports: number;
    unverifiedReports: number; inconclusiveReports: number; responseHoursToAcknowledgement: number | null;
    overdueAssignments: number; resolutionRate: number;
  };
  reportsByPhase: CountRow[];
  verification: { status: string; count: number }[];
  geographic: {
    states: { state: string | null; count: number }[];
    counties: { state: string | null; county: string | null; count: number }[];
    riskByState: { state: string; riskLevel: string; count: number }[];
  };
  reportTrend: { period: string; count: number }[];
  earlyWarningTrend: { period: string; count: number }[];
  responsePerformance: { institutions: { institution: string; assigned: number; acknowledged: number; resolved: number; overdue: number }[] };
  priorityIncidents: { caseReference: string; riskLevel: string; status: string; updatedAt: string; report: { reference: string; category: string; state: string | null; county: string | null; phase: string; verificationStatus: string } | null }[];
};
type Recommendation = {
  id: string; title: string; rationale: string; action: string; stateCode: string | null; countyCode: string | null;
  status: string; reviewNotes: string | null; createdBy: { displayName: string }; reviewedBy: { displayName: string } | null;
};

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method, credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'The request could not be completed.');
  return data as T;
}

function format(value: string) { return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [role, setRole] = useState('');
  const [filters, setFilters] = useState({ from: '', to: '', phase: '', state: '', county: '', bucket: 'day' });
  const [form, setForm] = useState({ title: '', rationale: '', action: '', stateCode: '', countyCode: '' });
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const currentUser = await request<{ role: string }>('/auth/me');
      setRole(currentUser.role);
      const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      const [overview, recs] = await Promise.all([
        request<Overview>(`/analytics/overview${params.size ? `?${params}` : ''}`),
        request<Recommendation[]>('/analytics/recommendations'),
      ]);
      setData(overview);
      setRecommendations(recs);
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Unable to load analytics.';
      if (text.includes('Sign in') || text.includes('session')) location.href = '/login';
      else setError(text);
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  const canWrite = ['ADMIN', 'SUPERVISOR', 'ANALYST'].includes(role);
  const canReview = ['ADMIN', 'SUPERVISOR', 'ANALYST'].includes(role);

  function reportUrl(kind: string) {
    const params = new URLSearchParams(Object.entries(filters).filter(([key, value]) => value && key !== 'bucket'));
    return `${API}/analytics/reports/${kind}${params.size ? `?${params}` : ''}`;
  }

  async function download(kind: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(reportUrl(kind), { credentials: 'include' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Unable to generate report.');
      }
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `sautiwatch-${kind}-report.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to download report.'); }
    finally { setBusy(false); }
  }

  async function submitRecommendation(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await request('/analytics/recommendations', 'POST', {
        ...form, stateCode: form.stateCode || undefined, countyCode: form.countyCode || undefined,
      });
      setForm({ title: '', rationale: '', action: '', stateCode: '', countyCode: '' });
      setMessage('Recommendation submitted for independent review. It is not visible to executives until approved.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit recommendation.'); }
    finally { setBusy(false); }
  }

  async function reviewRecommendation(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(true); setError(''); setMessage('');
    try {
      await request(`/analytics/recommendations/${id}/review`, 'PATCH', { decision, notes: reviewNotes[id] || '' });
      setMessage(`Recommendation ${decision.toLowerCase()}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to review recommendation.'); }
    finally { setBusy(false); }
  }

  const maxTrend = Math.max(1, ...(data?.reportTrend.map(row => row.count) ?? []));
  const maxPhase = Math.max(1, ...(data?.reportsByPhase.map(row => row.count) ?? []));

  return (
    <main className="container analytics-page">
      <header className="dashhead">
        <div><Link href="/" className="brand">◈ SAUTIWATCH</Link><p className="muted">National election situation room</p></div>
        <div className="row"><Link className="btn secondary" href="/dashboard">Situation room</Link><Link className="btn secondary" href="/executive">Executive dashboard</Link></div>
      </header>
      <div className="row between analytics-heading">
        <div><div className="eyebrow">PHASE 2.5 · NATIONAL ANALYTICS</div><h1>Situation-room analytics</h1><p className="muted">Live database aggregates for operational analysis. Trends are descriptive, not forecasts.</p></div>
        <button className="btn secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      <section className="card analytics-filters">
        <label>From<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })}/></label>
        <label>To<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })}/></label>
        <label>Electoral phase<select value={filters.phase} onChange={event => setFilters({ ...filters, phase: event.target.value })}><option value="">All phases</option><option value="PRE_ELECTION">Pre-election</option><option value="ELECTION_DAY">Election day</option><option value="POST_ELECTION">Post-election</option></select></label>
        <label>State code<input value={filters.state} onChange={event => setFilters({ ...filters, state: event.target.value, county: event.target.value ? filters.county : '' })} placeholder="e.g. CES"/></label>
        <label>County code<input value={filters.county} onChange={event => setFilters({ ...filters, county: event.target.value })} placeholder="Requires state code"/></label>
        <label>Trend interval<select value={filters.bucket} onChange={event => setFilters({ ...filters, bucket: event.target.value })}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label>
      </section>
      {loading ? <div className="card">Loading live analytics…</div> : data && <>
        <p className="analytics-asof">Selected period: {new Date(data.reportingPeriod.from).toLocaleDateString()} – {new Date(data.reportingPeriod.to).toLocaleDateString()} · Updated {new Date(data.generatedAt).toLocaleString()}</p>
        <section className="metricgrid analytics-metrics">
          <Metric label="Reports received" value={data.metrics.reportsReceived}/>
          <Metric label="Critical incidents" value={data.metrics.criticalIncidents}/>
          <Metric label="Open cases" value={data.metrics.openCases}/>
          <Metric label="Verified reports" value={data.metrics.verifiedReports}/>
          <Metric label="Overdue assignments" value={data.metrics.overdueAssignments}/>
          <Metric label="Resolution rate" value={`${data.metrics.resolutionRate}%`}/>
          <Metric label="Avg. hours to acknowledgement" value={data.metrics.responseHoursToAcknowledgement ?? '—'}/>
          <Metric label="Unverified / inconclusive" value={`${data.metrics.unverifiedReports} / ${data.metrics.inconclusiveReports}`}/>
        </section>
        <div className="grid2 analytics-charts">
          <section className="card"><h2>Reports by electoral phase</h2>{data.reportsByPhase.length ? data.reportsByPhase.map(row => <Bar key={row.phase} label={format(row.phase)} value={row.count} max={maxPhase}/>) : <p className="muted">No reports in this period.</p>}</section>
          <section className="card"><h2>Incident reporting trend</h2><div className="analytics-trend">{data.reportTrend.length ? data.reportTrend.map(row => <div className="trend-column" key={row.period} title={`${new Date(row.period).toLocaleDateString()}: ${row.count}`}><span style={{ height: `${Math.max(3, row.count / maxTrend * 100)}%` }}/><small>{new Date(row.period).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div>) : <p className="muted">No reports in this period.</p>}</div></section>
          <section className="card"><h2>Verification performance</h2>{data.verification.filter(row => row.count).map(row => <Bar key={row.status} label={format(row.status)} value={row.count} max={Math.max(1, ...data.verification.map(item => item.count))}/>)}</section>
          <section className="card"><h2>Case risk by state</h2>{data.geographic.riskByState.length ? data.geographic.riskByState.slice(0, 16).map(row => <Bar key={`${row.state}-${row.riskLevel}`} label={`${row.state} · ${format(row.riskLevel)}`} value={row.count} max={Math.max(1, ...data.geographic.riskByState.map(item => item.count))}/>) : <p className="muted">No located case-linked reports in this period.</p>}</section>
          <section className="card"><h2>County incident comparisons</h2>{data.geographic.counties.length ? data.geographic.counties.slice(0, 10).map(row => <Bar key={`${row.state}-${row.county}`} label={`${row.county}, ${row.state}`} value={row.count} max={Math.max(1, ...data.geographic.counties.map(item => item.count))}/>) : <p className="muted">No located county reports in this period.</p>}</section>
        </div>
        <section className="card analytics-table-card">
          <h2>Emerging early-warning trends</h2>
          {data.earlyWarningTrend.length ? <div className="analytics-inline-list">{data.earlyWarningTrend.map(row => <span key={row.period}>{new Date(row.period).toLocaleDateString()}: <strong>{row.count}</strong> alerts</span>)}</div> : <p className="muted">No early-warning alerts in this period.</p>}
        </section>
        <section className="card analytics-table-card">
          <h2>Response institution performance</h2>
          {data.responsePerformance.institutions.length ? <div className="tablewrap"><table><thead><tr><th>Institution / assignee</th><th>Assigned</th><th>Acknowledged</th><th>Resolved</th><th>Overdue</th></tr></thead><tbody>{data.responsePerformance.institutions.map(row => <tr key={row.institution}><td>{row.institution}</td><td>{row.assigned}</td><td>{row.acknowledged}</td><td>{row.resolved}</td><td>{row.overdue}</td></tr>)}</tbody></table></div> : <p className="muted">No assignments in this period.</p>}
        </section>
        <section className="card analytics-table-card">
          <h2>Priority incidents requiring review</h2>
          {data.priorityIncidents.length ? <div className="tablewrap"><table><thead><tr><th>Case</th><th>Risk</th><th>Location</th><th>Category</th><th>Verification</th><th>Status</th></tr></thead><tbody>{data.priorityIncidents.map(item => <tr key={item.caseReference}><td>{item.caseReference}</td><td>{item.riskLevel}</td><td>{[item.report?.county, item.report?.state].filter(Boolean).join(', ') || 'Unspecified'}</td><td>{item.report ? format(item.report.category) : '—'}</td><td>{item.report ? format(item.report.verificationStatus) : '—'}</td><td>{format(item.status)}</td></tr>)}</tbody></table></div> : <p className="muted">No high or critical unresolved cases match these filters.</p>}
        </section>
        <section className="card analytics-table-card">
          <h2>Executive report downloads</h2>
          <p className="muted">CSV reports include reporting period, source, verification status, methodology and limitations. Downloads contain aggregate indicators and limited incident references; no reporter identities or narratives.</p>
          <div className="analytics-downloads">{[['daily','Daily situation report'],['weekly','Weekly early-warning bulletin'],['monthly','Monthly risk assessment'],['critical','Critical incident briefing'],['response','Response performance report'],['state','State report'],['county','County report']].map(([kind, label]) => <button key={kind} className="btn secondary" disabled={busy || (kind === 'state' && !filters.state) || (kind === 'county' && (!filters.state || !filters.county))} onClick={() => void download(kind)}><FileDown size={15}/>{label}</button>)}</div>
        </section>
        <section className="grid2 analytics-recommendations">
          {canWrite && <form className="card" onSubmit={submitRecommendation}>
            <h2>Submit strategic recommendation</h2><p className="muted">Recommendations stay internal until an independent analyst or supervisor reviews them.</p>
            <label>Title<input required minLength={5} maxLength={200} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })}/></label>
            <label>Evidence-based rationale<textarea required minLength={20} maxLength={4000} value={form.rationale} onChange={event => setForm({ ...form, rationale: event.target.value })}/></label>
            <label>Proposed action<textarea required minLength={10} maxLength={2000} value={form.action} onChange={event => setForm({ ...form, action: event.target.value })}/></label>
            <div className="analytics-location-inputs"><label>State (optional)<input value={form.stateCode} onChange={event => setForm({ ...form, stateCode: event.target.value })}/></label><label>County (optional)<input value={form.countyCode} onChange={event => setForm({ ...form, countyCode: event.target.value })}/></label></div>
            <button className="btn" disabled={busy}>Submit for review</button>
          </form>}
          <section className="card"><h2>Recommendation review queue</h2>{recommendations.length ? recommendations.map(item => <article className="recommendation-card" key={item.id}>
            <div className="row between"><strong>{item.title}</strong><span className={`status recommendation-${item.status.toLowerCase()}`}>{format(item.status)}</span></div>
            <p>{item.rationale}</p><p><strong>Proposed action:</strong> {item.action}</p>
            <small className="muted">Submitted by {item.createdBy.displayName}{item.reviewedBy ? ` · Reviewed by ${item.reviewedBy.displayName}` : ''} {[item.countyCode, item.stateCode].filter(Boolean).join(', ') && ` · ${[item.countyCode, item.stateCode].filter(Boolean).join(', ')}`}</small>
            {canReview && item.status === 'PENDING' && <div className="recommendation-review"><textarea placeholder="Review notes (required, at least 10 characters)" value={reviewNotes[item.id] || ''} onChange={event => setReviewNotes({ ...reviewNotes, [item.id]: event.target.value })}/><div className="row"><button className="btn" disabled={busy || (reviewNotes[item.id] || '').trim().length < 10} onClick={() => void reviewRecommendation(item.id, 'APPROVED')}>Approve</button><button className="btn secondary" disabled={busy || (reviewNotes[item.id] || '').trim().length < 10} onClick={() => void reviewRecommendation(item.id, 'REJECTED')}>Reject</button></div></div>}
            {item.reviewNotes && <p className="muted"><strong>Review:</strong> {item.reviewNotes}</p>}
          </article>) : <p className="muted">No recommendations are awaiting review.</p>}</section>
        </section>
      </>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="card metric"><div className="muted">{label}</div><div className="metricvalue">{value}</div></div>;
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return <div className="analytics-bar"><div className="row between"><span>{label}</span><strong>{value}</strong></div><div className="analytics-bar-track"><span style={{ width: `${Math.max(2, value / max * 100)}%` }}/></div></div>;
}
