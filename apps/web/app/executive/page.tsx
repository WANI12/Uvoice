'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileDown, RefreshCw } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
type Briefing = {
  generatedAt: string;
  reportingPeriod: { from: string; to: string };
  metrics: {
    reportsReceived: number; criticalIncidents: number; openCases: number; verifiedReports: number;
    overdueAssignments: number; resolutionRate: number; responseHoursToAcknowledgement: number | null;
  };
  reportsByPhase: { phase: string; count: number }[];
  geographic: {
    riskByState: { state: string; riskLevel: string; count: number }[];
    counties: { state: string | null; county: string | null; count: number }[];
  };
  reportTrend: { period: string; count: number }[];
  responsePerformance: { institutions: { institution: string; assigned: number; resolved: number; overdue: number }[] };
  priorityIncidents: { caseReference: string; riskLevel: string; status: string; report: { category: string; state: string | null; county: string | null; verificationStatus: string } | null }[];
  approvedRecommendations: { title: string; rationale: string; action: string; stateCode: string | null; countyCode: string | null; reviewedAt: string | null }[];
  limitations: string[];
};

async function getData<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: 'include' });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Unable to load executive intelligence.');
  return data as T;
}

function format(value: string) { return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }

export default function ExecutivePage() {
  const [data, setData] = useState<Briefing | null>(null);
  const [filters, setFilters] = useState({ from: '', to: '', phase: '', state: '', county: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const user = await getData<{ role: string }>('/auth/me');
      if (!['EXECUTIVE', 'ADMIN', 'SUPERVISOR', 'ANALYST'].includes(user.role)) {
        throw new Error('Executive intelligence is restricted to authorised decision-makers.');
      }
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      setData(await getData<Briefing>(`/analytics/executive${query.size ? `?${query}` : ''}`));
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Unable to load the executive dashboard.';
      if (text.includes('Sign in') || text.includes('session')) location.href = '/login';
      else setError(text);
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  async function download(kind: string) {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    try {
      const response = await fetch(`${API}/analytics/reports/${kind}${query.size ? `?${query}` : ''}`, { credentials: 'include' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Unable to generate report.');
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await response.blob());
      link.download = `uvoice-${kind}-briefing.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to download briefing.'); }
  }

  const maxPhase = Math.max(1, ...(data?.reportsByPhase.map(item => item.count) || []));

  return <main className="container analytics-page">
    <header className="dashhead">
      <div><Link href="/" className="brand">◈ UVOICE</Link><p className="muted">Restricted national intelligence view</p></div>
      <div className="row"><Link className="btn secondary" href="/dashboard">Situation room</Link><Link className="btn secondary" href="/analytics">Operational analytics</Link></div>
    </header>
    <div className="row between analytics-heading">
      <div><div className="eyebrow">EXECUTIVE INTELLIGENCE</div><h1>National situation room</h1><p className="muted">Aggregated risk and response overview with analyst-approved recommendations.</p></div>
      <button className="btn secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="card analytics-filters">
      <label>From<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })}/></label>
      <label>To<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })}/></label>
      <label>Electoral phase<select value={filters.phase} onChange={event => setFilters({ ...filters, phase: event.target.value })}><option value="">All phases</option><option value="PRE_ELECTION">Pre-election</option><option value="ELECTION_DAY">Election day</option><option value="POST_ELECTION">Post-election</option></select></label>
      <label>State code<input value={filters.state} onChange={event => setFilters({ ...filters, state: event.target.value, county: event.target.value ? filters.county : '' })} placeholder="Optional"/></label>
      <label>County code<input value={filters.county} onChange={event => setFilters({ ...filters, county: event.target.value })} placeholder="Requires state"/></label>
    </section>
    {loading ? <div className="card">Loading executive intelligence…</div> : data && <>
      <p className="analytics-asof">Reporting period: {new Date(data.reportingPeriod.from).toLocaleDateString()} – {new Date(data.reportingPeriod.to).toLocaleDateString()} · Updated {new Date(data.generatedAt).toLocaleString()}</p>
      <section className="metricgrid analytics-metrics">
        <Metric label="Reports received" value={data.metrics.reportsReceived}/>
        <Metric label="Critical incidents" value={data.metrics.criticalIncidents}/>
        <Metric label="Outstanding open cases" value={data.metrics.openCases}/>
        <Metric label="Verified reports" value={data.metrics.verifiedReports}/>
        <Metric label="Overdue critical assignments" value={data.metrics.overdueAssignments}/>
        <Metric label="Response resolution rate" value={`${data.metrics.resolutionRate}%`}/>
        <Metric label="Avg. hours to acknowledgement" value={data.metrics.responseHoursToAcknowledgement ?? '—'}/>
      </section>
      <div className="grid2 analytics-charts">
        <section className="card"><h2>Reports by electoral phase</h2>{data.reportsByPhase.length ? data.reportsByPhase.map(row => <div className="analytics-bar" key={row.phase}><div className="row between"><span>{format(row.phase)}</span><strong>{row.count}</strong></div><div className="analytics-bar-track"><span style={{ width: `${Math.max(2, row.count / maxPhase * 100)}%` }}/></div></div>) : <p className="muted">No reports in this period.</p>}</section>
        <section className="card"><h2>Emerging geographic risk trends</h2>{data.geographic.riskByState.length ? data.geographic.riskByState.slice(0, 12).map(row => <div className="analytics-bar" key={`${row.state}-${row.riskLevel}`}><div className="row between"><span>{row.state} · {format(row.riskLevel)}</span><strong>{row.count}</strong></div><div className="analytics-bar-track"><span style={{ width: `${Math.max(2, row.count / Math.max(1, ...data.geographic.riskByState.map(item => item.count)) * 100)}%` }}/></div></div>) : <p className="muted">No located case-linked reports in this period.</p>}</section>
        <section className="card"><h2>County concentration indicators</h2>{data.geographic.counties.length ? data.geographic.counties.slice(0, 8).map(row => <div className="analytics-bar" key={`${row.state}-${row.county}`}><div className="row between"><span>{row.county}, {row.state}</span><strong>{row.count}</strong></div><div className="analytics-bar-track"><span style={{ width: `${Math.max(2, row.count / Math.max(1, ...data.geographic.counties.map(item => item.count)) * 100)}%` }}/></div></div>) : <p className="muted">No located county reports in this period.</p>}</section>
      </div>
      <section className="card analytics-table-card">
        <h2>Priority incidents for leadership attention</h2>
        {data.priorityIncidents.length ? <div className="tablewrap"><table><thead><tr><th>Case</th><th>Risk</th><th>Location</th><th>Category</th><th>Verification</th><th>Status</th></tr></thead><tbody>{data.priorityIncidents.map(item => <tr key={item.caseReference}><td>{item.caseReference}</td><td>{item.riskLevel}</td><td>{[item.report?.county, item.report?.state].filter(Boolean).join(', ') || 'Unspecified'}</td><td>{item.report ? format(item.report.category) : '—'}</td><td>{item.report ? format(item.report.verificationStatus) : '—'}</td><td>{format(item.status)}</td></tr>)}</tbody></table></div> : <p className="muted">No high or critical unresolved cases require attention for this period.</p>}
      </section>
      <section className="card analytics-table-card">
        <h2>Response institution performance</h2>
        {data.responsePerformance.institutions.length ? <div className="tablewrap"><table><thead><tr><th>Institution / assignee</th><th>Assigned</th><th>Resolved</th><th>Overdue</th></tr></thead><tbody>{data.responsePerformance.institutions.map(item => <tr key={item.institution}><td>{item.institution}</td><td>{item.assigned}</td><td>{item.resolved}</td><td>{item.overdue}</td></tr>)}</tbody></table></div> : <p className="muted">No response assignments in this period.</p>}
      </section>
      <section className="card analytics-table-card">
        <h2>Approved strategic recommendations</h2>
        {data.approvedRecommendations.length ? data.approvedRecommendations.map((item, index) => <article className="recommendation-card" key={`${item.title}-${index}`}>
          <strong>{item.title}</strong><p>{item.rationale}</p><p><strong>Recommended action:</strong> {item.action}</p>
          <small className="muted">{[item.countyCode, item.stateCode].filter(Boolean).join(', ') || 'National'}{item.reviewedAt ? ` · Approved ${new Date(item.reviewedAt).toLocaleDateString()}` : ''}</small>
        </article>) : <p className="muted">No approved strategic recommendations are available.</p>}
      </section>
      <section className="card analytics-table-card">
        <h2>Download executive summaries</h2>
        <div className="analytics-downloads">{[['daily','Daily situation report'],['weekly','Weekly early-warning bulletin'],['monthly','Monthly risk assessment'],['critical','Critical incident briefing'],['response','Response performance report']].map(([kind, label]) => <button key={kind} className="btn secondary" onClick={() => void download(kind)}><FileDown size={15}/>{label}</button>)}</div>
      </section>
      <section className="card analytics-table-card"><h2>Methodology and limitations</h2><ul className="analytics-limitations">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul></section>
    </>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="card metric"><div className="muted">{label}</div><div className="metricvalue">{value}</div></div>;
}
