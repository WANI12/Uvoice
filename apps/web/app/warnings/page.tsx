'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BellRing, FileText, RefreshCw } from 'lucide-react';
import SituationRoomShell from '../components/situation-room-shell';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

type Alert = {
  id: string;
  ruleCode: string;
  severity: string;
  title: string;
  summary: string;
  stateCode: string | null;
  countyCode: string | null;
  category: string | null;
  details: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { displayName: string } | null;
};

type Bulletin = {
  content: {
    title: string;
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    summary: string;
    reportCount: number;
    activeWarningCount: number;
    topCategories: { category: string; count: number }[];
    topLocations: { stateCode: string | null; countyCode: string | null; count: number }[];
    reportStatuses: { status: string; count: number }[];
    caseRiskLevels: { riskLevel: string; count: number }[];
    caseStatuses: { status: string; count: number }[];
    safeguards: string[];
  };
};

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

export default function WarningsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [bulletin, setBulletin] = useState<Bulletin | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');
  const [filter, setFilter] = useState('');
  const [role, setRole] = useState('');
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
      setAlerts(await request<Alert[]>(`/early-warning/alerts${filter ? `?status=${filter}` : ''}`));
      setBulletin(await request<Bulletin>(`/early-warning/bulletins/${period}`));
    } catch (e) {
      const errorText = e instanceof Error ? e.message : 'Unable to load early-warning data.';
      if (errorText.includes('Sign in') || errorText.includes('session')) location.href = '/login';
      else setError(errorText);
    } finally {
      setLoading(false);
    }
  }, [filter, period]);

  useEffect(() => { void load(); }, [load]);

  async function runAssessment() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await request<{ alertsCreated: number; alreadyRunning?: boolean }>('/early-warning/run', 'POST');
      setMessage(result.alreadyRunning ? 'An early-warning assessment is already running.' : `Assessment complete. ${result.alertsCreated} new alert${result.alertsCreated === 1 ? '' : 's'} created.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to run the assessment.');
    } finally {
      setBusy(false);
    }
  }

  async function generateBulletin() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await request<Bulletin>(`/early-warning/bulletins/${period}/generate`, 'POST');
      setBulletin(result);
      setMessage(`${period === 'daily' ? 'Daily' : 'Weekly'} bulletin generated and saved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to generate the bulletin.');
    } finally {
      setBusy(false);
    }
  }

  async function updateAlert(alert: Alert, action: 'acknowledge' | 'dismiss') {
    let reason: string | undefined;
    if (action === 'dismiss') {
      reason = window.prompt('Reason for dismissing this alert (minimum 10 characters):') || '';
      if (reason.trim().length < 10) return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await request(`/early-warning/alerts/${alert.id}/${action}`, 'POST', action === 'dismiss' ? { reason } : undefined);
      setMessage(action === 'dismiss' ? 'Alert dismissed with reason recorded.' : 'Alert acknowledged.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update the alert.');
    } finally {
      setBusy(false);
    }
  }

  const canRun = ['ADMIN', 'SUPERVISOR'].includes(role);
  const canManage = ['ADMIN', 'SUPERVISOR', 'ANALYST'].includes(role);

  return (
    <SituationRoomShell>
    <main className="container warning-page" style={{ paddingTop: 32, paddingBottom: 70 }}>
      <header className="dashhead">
        <div><Link href="/" className="brand">◈ UVOICE</Link><p className="muted">National election early warning workspace</p></div>
        <div className="row"><Link className="btn secondary" href="/dashboard">Situation room</Link><Link className="btn secondary" href="/cases">Case management</Link><Link className="btn secondary" href="/operations">GIS operations</Link></div>
      </header>
      <div className="row between case-page-heading">
        <div><div className="eyebrow">AUTOMATED EARLY WARNING</div><h1>Signals &amp; situation bulletins</h1><p className="muted">Rule-based signals help authorised teams prioritise review. Alerts are not verified findings or automated response decisions.</p></div>
        {canRun && <button className="btn" onClick={() => void runAssessment()} disabled={busy}><RefreshCw size={16}/> Run assessment</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {loading ? <div className="card">Loading warning signals…</div> : <>
        <div className="warning-period-row">
          <label>Bulletin period<select value={period} onChange={event => setPeriod(event.target.value as 'daily' | 'weekly')}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          <label>Alert status<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">All alerts</option><option value="OPEN">Open</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="DISMISSED">Dismissed</option></select></label>
          <button className="btn secondary" onClick={() => void generateBulletin()} disabled={busy}><FileText size={15}/> Generate bulletin</button>
          <button className="btn secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button>
        </div>
        <section className="card warning-bulletin">
          <div className="row between"><div className="row"><FileText size={20}/><h2>{bulletin?.content.title || 'Situation bulletin'}</h2></div><span className="muted">Generated {bulletin ? new Date(bulletin.content.generatedAt).toLocaleString() : '—'}</span></div>
          {bulletin && <>
            <p>{bulletin.content.summary}</p>
            <div className="metricgrid warning-metrics"><SmallMetric label="Reports received" value={bulletin.content.reportCount}/><SmallMetric label="Open warning signals" value={bulletin.content.activeWarningCount}/></div>
            <div className="grid2 warning-breakdowns">
              <Breakdown title="Top incident categories" rows={bulletin.content.topCategories.map(row => ({ label: format(row.category), count: row.count }))}/>
              <Breakdown title="Most reported locations" rows={bulletin.content.topLocations.map(row => ({ label: [row.countyCode, row.stateCode].filter(Boolean).join(', ') || 'Unspecified', count: row.count }))}/>
              <Breakdown title="Case risk levels" rows={bulletin.content.caseRiskLevels.map(row => ({ label: row.riskLevel, count: row.count }))}/>
              <Breakdown title="Case statuses" rows={bulletin.content.caseStatuses.map(row => ({ label: format(row.status), count: row.count }))}/>
            </div>
            <ul className="warning-safeguards">{bulletin.content.safeguards.map(item => <li key={item}>{item}</li>)}</ul>
          </>}
        </section>
        <section className="card warning-alerts">
          <div className="row between"><h2><BellRing size={19}/> Early-warning alerts</h2><span className="muted">{alerts.length} recent alerts</span></div>
          <p className="muted warning-intro">The engine checks repeated location/category reports, county-level report concentrations, unresolved critical cases, case escalations, and overdue high/critical assignments. Review duplicate or related reports before drawing conclusions.</p>
          {alerts.length ? <div className="warning-alert-list">{alerts.map(alert => <article className="warning-alert" key={alert.id}>
            <div className="warning-alert-heading">
              <span className={`case-risk risk-${alert.severity.toLowerCase()}`}>{alert.severity}</span>
              <span className={`case-status status-${alert.status.toLowerCase()}`}>{format(alert.status)}</span>
              <time>{new Date(alert.createdAt).toLocaleString()}</time>
            </div>
            <h3><AlertTriangle size={17}/>{alert.title}</h3>
            <p>{alert.summary}</p>
            <div className="case-report-meta"><span>{alert.ruleCode.replaceAll('_', ' ')}</span>{alert.category && <span>{format(alert.category)}</span>}{(alert.countyCode || alert.stateCode) && <span>{[alert.countyCode, alert.stateCode].filter(Boolean).join(', ')}</span>}</div>
            {alert.acknowledgedBy && <small className="muted">{alert.status === 'DISMISSED' ? 'Dismissed' : 'Acknowledged'} by {alert.acknowledgedBy.displayName} · {alert.acknowledgedAt ? new Date(alert.acknowledgedAt).toLocaleString() : ''}</small>}
            {alert.status === 'OPEN' && canManage && <div className="row warning-alert-actions"><button className="btn" onClick={() => void updateAlert(alert, 'acknowledge')} disabled={busy}>Acknowledge</button><button className="btn secondary" onClick={() => void updateAlert(alert, 'dismiss')} disabled={busy}>Dismiss with reason</button></div>}
          </article>)}</div> : <p className="muted">No alerts match this filter. The automated rule scan runs periodically; supervisors can run an assessment on demand.</p>}
        </section>
      </>}
    </main>
    </SituationRoomShell>
  );
}

function format(value: string) { return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }
function SmallMetric({ label, value }: { label: string; value: number }) {
  return <div className="card metric"><div className="muted">{label}</div><div className="metricvalue">{value}</div></div>;
}
function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return <section><h3>{title}</h3>{rows.length ? rows.map(row => <div className="phase" key={row.label}><span>{row.label}</span><strong>{row.count}</strong></div>) : <p className="muted">No activity in this period.</p>}</section>;
}
