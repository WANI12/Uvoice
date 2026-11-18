'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FileDown, RefreshCw } from 'lucide-react';
import SituationRoomShell from '../components/situation-room-shell';
import { StateRiskComparison, TrendChart } from '../components/analytics-visualizations';

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
  responsePerformance: { institutions: { institution: string; assigned: number; acknowledged: number; resolved: number; overdue: number }[] };
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
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const user = await getData<{ role: string }>('/auth/me');
      if (!['EXECUTIVE', 'ADMIN', 'SUPERVISOR', 'ANALYST'].includes(user.role)) {
        throw new Error('Executive intelligence is restricted to authorised decision-makers.');
      }
      const query = new URLSearchParams(Object.entries(appliedFilters).filter(([, value]) => value));
      setData(await getData<Briefing>(`/analytics/executive${query.size ? `?${query}` : ''}`));
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Unable to load the executive dashboard.';
      if (text.includes('Sign in') || text.includes('session')) location.href = '/login';
      else setError(text);
    } finally { setLoading(false); }
  }, [appliedFilters]);

  useEffect(() => { void load(); }, [load]);

  async function download(kind: string) {
    const query = new URLSearchParams(Object.entries(appliedFilters).filter(([, value]) => value));
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API}/analytics/reports/${kind}${query.size ? `?${query}` : ''}`, { credentials: 'include' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Unable to generate report.');
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await response.blob());
      link.download = `sautiwatch-${kind}-briefing.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to download briefing.'); }
    finally { setBusy(false); }
  }

  const maxPhase = Math.max(1, ...(data?.reportsByPhase.map(item => item.count) || []));
  const maxCountyCount = Math.max(1, ...(data?.geographic.counties.map(item => item.count) || []));

  return <SituationRoomShell><main className="container analytics-page">
    <header className="dashhead">
      <div><Link href="/" className="brand">◈ SAUTIWATCH</Link><p className="muted">Restricted national intelligence view</p></div>
      <div className="row"><Link className="btn secondary" href="/dashboard">Situation room</Link><Link className="btn secondary" href="/analytics">Operational analytics</Link></div>
    </header>
    <div className="row between analytics-heading">
      <div><div className="eyebrow">EXECUTIVE INTELLIGENCE</div><h1>National situation room</h1><p className="muted">Aggregated risk and response overview with analyst-approved recommendations.</p></div>
      <button className="btn secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button>
    </div>
    {error && <div className="error analytics-error" role="alert"><span>{error}{data && ' Previous results remain visible; refresh to try again.'}</span>{!data && <button className="btn secondary" onClick={() => void load()}>Try again</button>}</div>}
    <section className="card analytics-filters">
      <label>From<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })}/></label>
      <label>To<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })}/></label>
      <label>Electoral phase<select value={filters.phase} onChange={event => setFilters({ ...filters, phase: event.target.value })}><option value="">All phases</option><option value="PRE_ELECTION">Pre-election</option><option value="ELECTION_DAY">Election day</option><option value="POST_ELECTION">Post-election</option></select></label>
      <label>State code<input value={filters.state} onChange={event => setFilters({ ...filters, state: event.target.value, county: '' })} placeholder="Optional"/></label>
      <label>County code<input value={filters.county} onChange={event => setFilters({ ...filters, county: event.target.value })} placeholder="Requires state"/></label>
      <div className="analytics-filter-actions">
        <button className="btn" onClick={() => setAppliedFilters({ ...filters })} disabled={loading}>Apply filters</button>
        <button className="btn secondary" onClick={() => { const defaults = { from: '', to: '', phase: '', state: '', county: '' }; setFilters(defaults); setAppliedFilters(defaults); }} disabled={loading}>Reset filters</button>
        {JSON.stringify(filters) !== JSON.stringify(appliedFilters) && <span className="muted" role="status">Filters changed. Apply to refresh results.</span>}
      </div>
    </section>
    {loading && !data && <div className="card analytics-loading" role="status"><span className="situation-spinner"/> Loading national intelligence…</div>}
    {!loading && !data && !error && <div className="card analytics-empty-state"><h2>No executive data available</h2><p className="muted">No results could be loaded for the current filters.</p><button className="btn secondary" onClick={() => void load()}>Try again</button></div>}
    {data && <>
      {loading && <p className="analytics-refreshing" role="status">Refreshing intelligence for the applied filters…</p>}
      <p className="analytics-asof">Reporting period: {new Date(data.reportingPeriod.from).toLocaleDateString()} – {new Date(data.reportingPeriod.to).toLocaleDateString()} · Updated {new Date(data.generatedAt).toLocaleString()}</p>
      <div className="analytics-kpi-section"><div className="analytics-section-heading"><div><div className="eyebrow">NATIONAL SNAPSHOT</div><h2>Key indicators</h2></div><span className="muted">For the selected reporting period</span></div>
      <section className="metricgrid analytics-metrics analytics-primary-metrics">
        <Metric label="Reports received" value={data.metrics.reportsReceived}/>
        <Metric label="Critical incidents" value={data.metrics.criticalIncidents}/>
        <Metric label="Outstanding open cases" value={data.metrics.openCases}/>
        <Metric label="Verified reports" value={data.metrics.verifiedReports}/>
      </section>
      <section className="metricgrid analytics-metrics analytics-secondary-metrics analytics-secondary-metrics-three">
        <Metric label="Overdue critical assignments" value={data.metrics.overdueAssignments}/>
        <Metric label="Response resolution rate" value={`${data.metrics.resolutionRate}%`}/>
        <Metric label="Avg. hours to acknowledgement" value={data.metrics.responseHoursToAcknowledgement ?? '—'}/>
      </section>
      </div>
      <div className="analytics-section-heading analytics-section-heading-spaced"><div><div className="eyebrow">TRENDS &amp; PERFORMANCE</div><h2>National indicators</h2></div></div>
      <div className="grid2 analytics-charts">
        <section className="card"><h2>Reports by electoral phase</h2>{data.reportsByPhase.length ? data.reportsByPhase.map(row => <div className="analytics-bar" key={row.phase}><div className="row between"><span>{format(row.phase)}</span><strong>{row.count}</strong></div><div className="analytics-bar-track"><span style={{ width: `${Math.max(2, row.count / maxPhase * 100)}%` }}/></div></div>) : <p className="muted">No reports in this period.</p>}</section>
        <section className="card"><h2>Incident reporting trend</h2>{data.reportTrend.length ? <TrendChart rows={data.reportTrend}/> : <p className="muted analytics-chart-empty">No reports in this period.</p>}</section>
        <section className="card analytics-geographic-card"><h2>Emerging geographic risk trends</h2><p className="analytics-card-description">Compare reported case counts by risk level; segments show each state’s mix.</p>{data.geographic.riskByState.length ? <StateRiskComparison rows={data.geographic.riskByState}/> : <p className="muted analytics-chart-empty">No located case-linked reports in this period.</p>}</section>
        <section className="card"><h2>County concentration indicators</h2><p className="analytics-card-description">Highest-reporting counties for this period.</p>{data.geographic.counties.length ? data.geographic.counties.slice(0, 8).map(row => <div className="analytics-bar" key={`${row.state}-${row.county}`}><div className="row between"><span>{row.county}, {row.state}</span><strong>{row.count}</strong></div><div className="analytics-bar-track"><span style={{ width: `${Math.max(2, row.count / maxCountyCount * 100)}%` }}/></div></div>) : <p className="muted analytics-chart-empty">No located county reports in this period.</p>}</section>
      </div>
      <section className="card analytics-table-card">
        <h2>Priority incidents for leadership attention</h2>
        {data.priorityIncidents.length ? <div className="tablewrap"><table className="analytics-priority-table"><thead><tr><th>Case</th><th>Risk</th><th>Location</th><th>Category</th><th>Verification</th><th>Status</th></tr></thead><tbody>{data.priorityIncidents.map(item => <tr key={item.caseReference}><td><strong>{item.caseReference}</strong></td><td><span className={`analytics-risk-badge analytics-risk-${item.riskLevel.toLowerCase()}`}>{format(item.riskLevel)}</span></td><td>{[item.report?.county, item.report?.state].filter(Boolean).join(', ') || 'Unspecified'}</td><td>{item.report ? format(item.report.category) : '—'}</td><td>{item.report ? format(item.report.verificationStatus) : '—'}</td><td>{format(item.status)}</td></tr>)}</tbody></table></div> : <p className="muted">No high or critical unresolved cases require attention for this period.</p>}
      </section>
      <section className="card analytics-table-card">
        <h2>Response institution performance</h2>
        {data.responsePerformance.institutions.length ? <div className="tablewrap"><table><thead><tr><th>Institution / assignee</th><th>Assigned</th><th>Acknowledged</th><th>Resolved</th><th>Resolution progress</th><th>Overdue</th></tr></thead><tbody>{data.responsePerformance.institutions.map(item => <tr key={item.institution}><td>{item.institution}</td><td>{item.assigned}</td><td>{item.acknowledged}</td><td>{item.resolved}</td><td><div className="analytics-response-progress" role="img" aria-label={`${item.resolved} of ${item.assigned} assignments resolved`}><span style={{ width: `${item.assigned ? Math.min(100, item.resolved / item.assigned * 100) : 0}%` }}/></div><small>{item.assigned ? Math.round(item.resolved / item.assigned * 100) : 0}%</small></td><td>{item.overdue}</td></tr>)}</tbody></table></div> : <p className="muted">No response assignments in this period.</p>}
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
        <div className="analytics-downloads">{[['daily','Daily situation report'],['weekly','Weekly early-warning bulletin'],['monthly','Monthly risk assessment'],['critical','Critical incident briefing'],['response','Response performance report']].map(([kind, label]) => <button key={kind} className="btn secondary" disabled={busy || loading} onClick={() => void download(kind)}><FileDown size={15}/>{label}</button>)}</div>
      </section>
      <section className="card analytics-table-card"><h2>Methodology and limitations</h2><ul className="analytics-limitations">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul></section>
    </>}
  </main></SituationRoomShell>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="card metric"><div className="muted">{label}</div><div className="metricvalue">{value}</div></div>;
}
