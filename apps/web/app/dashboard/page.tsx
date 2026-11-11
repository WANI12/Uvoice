'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity, BarChart3, BellRing, Check, ChevronDown, ClipboardList, Filter,
  HelpCircle, Layers, LogOut, MapPin, Plus, Search, Share2, ShieldCheck, Users, X,
  RefreshCw,
} from 'lucide-react';
import GisMap, { IncidentCategoryCount } from '../operations/gis-map';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const MAP_ROLES = ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR', 'RESPONSE_OFFICER', 'FIELD_VERIFIER'];

type Summary = {
  metrics: { totalReports: number; verifiedReports: number; openCases: number; criticalCases: number; awaitingTriage: number };
  byPhase: { phase: string; _count: { _all: number } }[];
  recent: { reference: string; phase: string; category: string; status: string; submittedAt: string; stateCode: string | null }[];
  restrictedSummary: boolean;
};

const NAVIGATION = [
  { label: 'Map view', href: '/dashboard', icon: MapPin, roles: MAP_ROLES, active: true },
  { label: 'Data & analytics', href: '/analytics', icon: BarChart3, roles: ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR', 'RESPONSE_OFFICER'] },
  { label: 'Early warnings', href: '/warnings', icon: BellRing, roles: ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR'] },
  { label: 'Case management', href: '/cases', icon: ClipboardList, roles: ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR', 'RESPONSE_OFFICER', 'FIELD_VERIFIER', 'ORG_COORDINATOR'] },
  { label: 'Executive view', href: '/executive', icon: Activity, roles: ['ADMIN', 'SUPERVISOR', 'ANALYST', 'EXECUTIVE'] },
];

function format(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

export default function Dashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [user, setUser] = useState<{ displayName: string; role: string } | null>(null);
  const [categories, setCategories] = useState<IncidentCategoryCount[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[] | undefined>(undefined);
  const [phase, setPhase] = useState('');
  const [risk, setRisk] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const current = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (!current.ok) { location.href = '/login'; return; }
      const currentUser = await current.json() as { displayName: string; role: string };
      setUser(currentUser);
      const response = await fetch(`${API}/dashboard/summary`, { credentials: 'include' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to load dashboard.');
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load dashboard.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onCategoryCounts = useCallback((items: IncidentCategoryCount[]) => {
    setCategories(items);
    if (items.length) {
      setSelectedCategories(current => current === undefined ? items.map(item => item.category) : current.filter(value => items.some(item => item.category === value)));
    }
  }, []);

  const visibleNavigation = useMemo(() => NAVIGATION.filter(item => item.roles.includes(user?.role || '')), [user?.role]);

  async function shareDashboard() {
    setError('');
    setMessage('');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'UVoice Situation Room', url: location.href });
      } else {
        await navigator.clipboard.writeText(location.href);
        setMessage('Situation-room link copied.');
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError('Unable to share the situation-room link.');
    }
  }

  function toggleCategory(category: string) {
    setSelectedCategories(current => {
      const selected = current ?? categories.map(item => item.category);
      return selected.includes(category) ? selected.filter(value => value !== category) : [...selected, category];
    });
  }

  function logout() {
    fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).finally(() => { location.href = '/'; });
  }

  const mapAllowed = MAP_ROLES.includes(user?.role || '');
  const role = user?.role || '';
  return (
    <main className="situation-shell">
      <aside className="situation-rail">
        <Link href="/" className="situation-brand" aria-label="UVoice South Sudan home"><span className="situation-brand-mark">◈</span><span>UVOICE<small>SOUTH SUDAN</small></span></Link>
        <div className="situation-workspace">
          <div className="situation-workspace-mark"><Layers size={23}/></div>
          <div className="situation-workspace-copy"><strong>Situation Room</strong><small>National operations</small></div>
          <ChevronDown size={17} className="situation-workspace-chevron"/>
        </div>
        <div className="situation-identity"><span className="situation-online-dot"/> Signed in as <strong>{user?.displayName || 'Loading…'}</strong><small>{role.replaceAll('_', ' ')}</small></div>
        <Link className="situation-add-report" href="/report" aria-label="Add new report"><Plus size={19}/> Add new report</Link>
        <nav className="situation-nav" aria-label="Situation room">
          {visibleNavigation.map(item => {
            const Icon = item.icon;
            return <Link key={item.label} href={item.href} className={`situation-nav-link${item.active ? ' active' : ''}`} aria-label={item.label} aria-current={item.active ? 'page' : undefined}><Icon size={19}/><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="situation-nav-bottom">
          <Link className="situation-nav-link" href="/operations" aria-label="GIS operations"><Layers size={19}/><span>GIS operations</span></Link>
          <Link className="situation-nav-link" href="/organizations" aria-label="Organizations"><Users size={19}/><span>Organizations</span></Link>
          <Link className="situation-nav-link" href="/resources" aria-label="Help and guidance"><HelpCircle size={19}/><span>Help &amp; guidance</span></Link>
          {role === 'ADMIN' && <Link className="situation-nav-link" href="/admin" aria-label="Administration"><ShieldCheck size={19}/><span>Administration</span></Link>}
          <button className="situation-nav-link situation-logout" aria-label="Sign out" onClick={logout}><LogOut size={19}/><span>Sign out</span></button>
        </div>
        <div className="situation-rail-footer">UVoice · Operational workspace</div>
      </aside>

      <section className="situation-main">
        <header className="situation-topbar">
          <div className="situation-search"><Search size={19}/><input aria-label="Search map by category or location" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search reports by category or location"/></div>
          <div className="situation-top-actions">
            <button className="situation-toolbar-button" onClick={() => { setRefreshKey(value => value + 1); void load(); }} aria-label="Refresh dashboard data"><RefreshCw size={17}/></button>
            <button className={`situation-toolbar-button${filtersOpen ? ' selected' : ''}`} onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen}><Filter size={18}/><span>Filters</span></button>
            <button className="situation-share-button" onClick={() => void shareDashboard()}>Share <Share2 size={16}/></button>
            <button className="situation-language" aria-label="Language: English">EN <ChevronDown size={16}/></button>
          </div>
          {filtersOpen && <div className="situation-filter-menu">
            <div className="situation-filter-menu-header"><strong>Map filters</strong><button onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={16}/></button></div>
            <label>Electoral phase<select value={phase} onChange={event => setPhase(event.target.value)}><option value="">All phases</option><option value="PRE_ELECTION">Pre-election</option><option value="ELECTION_DAY">Election day</option><option value="POST_ELECTION">Post-election</option></select></label>
            <label>Risk level<select value={risk} onChange={event => setRisk(event.target.value)}><option value="">All risk levels</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MODERATE">Moderate</option><option value="LOW">Low</option></select></label>
          </div>}
        </header>

        <div className="situation-content">
          <aside className="situation-categories">
            <div className="situation-panel-heading"><div><span className="situation-kicker">LIVE MAP LAYERS</span><h1>Incident reports</h1></div><span className="situation-category-total">{categories.reduce((total, item) => total + item.count, 0)}</span></div>
            <div className="situation-select-actions">
              <button onClick={() => setSelectedCategories(categories.map(item => item.category))}>Select all</button>
              <button onClick={() => setSelectedCategories([])}>Clear</button>
            </div>
            <div className="situation-category-list">
              {categories.length ? categories.map((item, index) => {
                const checked = (selectedCategories ?? categories.map(category => category.category)).includes(item.category);
                return <label className={`situation-category-item category-tone-${index % 6}`} key={item.category}>
                  <input type="checkbox" checked={checked} onChange={() => toggleCategory(item.category)}/>
                  <span className="situation-checkbox"><Check size={13}/></span>
                  <span className="situation-category-name">{format(item.category)}</span>
                  <span className="situation-category-count">{item.count}</span>
                </label>;
              }) : <p className="situation-empty-categories">{loading ? 'Loading map layers…' : 'No geolocated reports yet.'}</p>}
            </div>
            <div className="situation-panel-footnote"><span className="situation-online-dot"/> Updated from current incident records</div>
          </aside>

          <section className="situation-map-area">
            <div className="situation-map-heading">
              <div><span className="situation-kicker">NATIONAL ELECTION SITUATION ROOM</span><h2>South Sudan incident map</h2><p>State and county boundaries with privacy-protected report hotspots.</p></div>
              <div className="situation-map-stats">
                <div><strong>{data?.metrics.totalReports ?? '—'}</strong><span>Reports</span></div>
                <div><strong>{data?.metrics.criticalCases ?? '—'}</strong><span>Critical</span></div>
                <div><strong>{data?.metrics.openCases ?? '—'}</strong><span>Open cases</span></div>
              </div>
            </div>
            {error && <p className="error situation-message" role="alert">{error}</p>}
            {message && <p className="success situation-message" role="status">{message}</p>}
            {loading ? <div className="situation-map-loading"><span className="situation-spinner"/> Loading national situation room…</div> : !mapAllowed ? <div className="situation-restricted"><ShieldCheck size={32}/><h3>Restricted map view</h3><p>Your account can view approved national summaries, but geographic incident details are limited to authorised operational roles.</p><Link className="btn" href="/executive">Open executive dashboard</Link></div> : (
              <GisMap
                api={API}
                phase={phase}
                selectedRisk={risk}
                refreshKey={refreshKey}
                selectedCategories={selectedCategories}
                onCategoryCounts={onCategoryCounts}
                searchTerm={search}
                embedded
              />
            )}
            {data && <div className="situation-map-footer">
              <span><span className="situation-map-legend-dot"/> Incident hotspot <span className="situation-map-high-dot"/> High / critical</span>
              <span>Counts reflect the recent geolocated map feed (up to 2,000 reports). Verify all signals before action.</span>
            </div>}
          </section>
        </div>
      </section>
    </main>
  );
}
