'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, RefreshCw } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type CaseSummary = {
  id: string;
  reference: string;
  title: string;
  status: string;
  riskLevel: string;
  riskScore: number | null;
  updatedAt: string;
  reports: { report: { reference: string; category: string; stateCode: string | null; countyCode: string | null } }[];
  assignments: { dueAt: string | null; user?: { displayName: string } | null; organization?: { name: string } | null }[];
};

async function getData<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Unable to load cases.');
  return data as T;
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [status, setStatus] = useState('');
  const [risk, setRisk] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const currentUser = await getData<{ role: string }>(`${API}/auth/me`);
      if (!currentUser) return;
      setCases(await getData<CaseSummary[]>(`${API}/cases`));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to load the case queue.';
      if (message.includes('Sign in') || message.includes('session')) location.href = '/login';
      else setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filteredCases = useMemo(() => cases.filter(item => {
    const report = item.reports[0]?.report;
    const text = `${item.reference} ${item.title} ${report?.category ?? ''} ${report?.stateCode ?? ''} ${report?.countyCode ?? ''}`.toLowerCase();
    return (!status || item.status === status) && (!risk || item.riskLevel === risk) && (!search || text.includes(search.toLowerCase()));
  }), [cases, risk, search, status]);
  const activeCases = cases.filter(item => !['CLOSED'].includes(item.status)).length;
  const reviewCases = cases.filter(item => item.status === 'RESOLVED_PENDING_REVIEW').length;
  const overdueCases = cases.filter(item => {
    const dueAt = item.assignments[0]?.dueAt;
    return dueAt && new Date(dueAt).getTime() < Date.now() && item.status !== 'CLOSED';
  }).length;

  return (
    <main className="container" style={{ paddingTop: 32, paddingBottom: 70 }}>
      <header className="dashhead">
        <div><Link href="/" className="brand">◈ UVOICE</Link><p className="muted">National election early warning workspace</p></div>
        <div className="row"><Link className="btn secondary" href="/dashboard">Situation room</Link><Link className="btn secondary" href="/operations">Operational intelligence</Link></div>
      </header>
      <div className="row between case-page-heading">
        <div><div className="eyebrow">PHASE 2.3 · CASE MANAGEMENT</div><h1>Case management &amp; response</h1><p className="muted">Triage, verification, assignment, response tracking and supervisor review.</p></div>
        <button className="btn secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <div className="card">Loading case queue…</div> : <>
        <section className="metricgrid">
          <Metric label="Active cases" value={activeCases}/>
          <Metric label="Awaiting supervisor review" value={reviewCases}/>
          <Metric label="Past response deadline" value={overdueCases}/>
          <Metric label="Cases in queue" value={cases.length}/>
        </section>
        <section className="card case-queue">
          <div className="row between"><h2><ClipboardList size={19}/> Case queue</h2><span className="muted">{filteredCases.length} shown</span></div>
          <div className="case-filters">
            <label>Search<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Reference, category or location"/></label>
            <label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{['OPEN','UNDER_VERIFICATION','ESCALATED','ACKNOWLEDGED','IN_PROGRESS','AWAITING_INFORMATION','RESOLVED_PENDING_REVIEW','REOPENED','CLOSED','REFERRED'].map(value => <option key={value} value={value}>{format(value)}</option>)}</select></label>
            <label>Risk<select value={risk} onChange={event => setRisk(event.target.value)}><option value="">All risk levels</option>{['CRITICAL','HIGH','MODERATE','LOW'].map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
          {filteredCases.length ? <div className="tablewrap"><table><thead><tr><th>Case</th><th>Location</th><th>Status</th><th>Risk</th><th>Responsible</th><th>Deadline</th><th>Updated</th><th/></tr></thead><tbody>
            {filteredCases.map(item => {
              const report = item.reports[0]?.report;
              const assignment = item.assignments[0];
              const overdue = assignment?.dueAt && new Date(assignment.dueAt).getTime() < Date.now() && item.status !== 'CLOSED';
              return <tr key={item.id}>
                <td><Link href={`/cases/${item.id}`}><strong>{item.reference}</strong></Link><small className="case-subtitle">{format(item.title)}</small></td>
                <td>{[report?.countyCode, report?.stateCode].filter(Boolean).join(', ') || '—'}</td>
                <td><span className={`case-status status-${item.status.toLowerCase()}`}>{format(item.status)}</span></td>
                <td><span className={`case-risk risk-${item.riskLevel.toLowerCase()}`}>{item.riskLevel}</span></td>
                <td>{assignment?.user?.displayName || assignment?.organization?.name || 'Unassigned'}</td>
                <td className={overdue ? 'case-overdue' : ''}>{assignment?.dueAt ? new Date(assignment.dueAt).toLocaleDateString() : '—'}</td>
                <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
                <td><Link className="btn secondary case-open" href={`/cases/${item.id}`}>Open</Link></td>
              </tr>;
            })}
          </tbody></table></div> : <p className="muted">No cases match these filters.</p>}
        </section>
      </>}
    </main>
  );
}

function format(value: string) { return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }
function Metric({ label, value }: { label: string; value: number }) {
  return <div className="card metric"><div className="metricicon"><ClipboardList size={19}/></div><div className="muted">{label}</div><div className="metricvalue">{value}</div></div>;
}
