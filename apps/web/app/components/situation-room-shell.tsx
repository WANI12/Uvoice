'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, BarChart3, BellRing, ClipboardList, HelpCircle, Layers, LogOut,
  MapPin, Plus, Search, Share2, ShieldCheck, Users,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const NAVIGATION = [
  { label: 'Map view', href: '/dashboard', icon: MapPin, roles: ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR', 'RESPONSE_OFFICER', 'FIELD_VERIFIER'] },
  { label: 'Analytics', href: '/analytics', icon: BarChart3, roles: ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR', 'RESPONSE_OFFICER'] },
  { label: 'Warnings', href: '/warnings', icon: BellRing, roles: ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR'] },
  { label: 'Cases', href: '/cases', icon: ClipboardList, roles: ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR', 'RESPONSE_OFFICER', 'FIELD_VERIFIER', 'ORG_COORDINATOR'] },
  { label: 'Executive', href: '/executive', icon: Activity, roles: ['ADMIN', 'SUPERVISOR', 'ANALYST', 'EXECUTIVE'] },
  { label: 'Operations', href: '/operations', icon: Layers, roles: ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR', 'RESPONSE_OFFICER', 'FIELD_VERIFIER'] },
  { label: 'Organizations', href: '/organizations', icon: Users, roles: [] },
  { label: 'Administration', href: '/admin', icon: ShieldCheck, roles: ['ADMIN'] },
  { label: 'Resources', href: '/resources', icon: HelpCircle, roles: [] },
];

type Props = { children: ReactNode; toolbar?: ReactNode };

export default function SituationRoomShell({ children, toolbar }: Props) {
  const pathname = usePathname();
  const [user, setUser] = useState<{ displayName: string; role: string } | null>(null);
  const [search, setSearch] = useState('');
  const [shareMessage, setShareMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/auth/me`, { credentials: 'include', signal: controller.signal })
      .then(async response => {
        if (!response.ok) return null;
        return response.json() as Promise<{ displayName: string; role: string }>;
      })
      .then(setUser)
      .catch(error => {
        if (!controller.signal.aborted) console.error('Unable to load current session for workspace navigation.', error);
      });
    return () => controller.abort();
  }, []);

  const links = useMemo(() => NAVIGATION.filter(item =>
    item.roles.length === 0 || item.roles.includes(user?.role || ''),
  ), [user?.role]);
  const searchResults = search.trim()
    ? links.filter(item => item.label.toLowerCase().includes(search.trim().toLowerCase()))
    : [];
  const activeLabel = links.find(item => item.href === pathname)?.label || 'UVoice';

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `UVoice · ${activeLabel}`, url: location.href });
      else {
        await navigator.clipboard.writeText(location.href);
        setShareMessage('Link copied');
        window.setTimeout(() => setShareMessage(''), 2500);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Unable to share the current workspace.', error);
    }
  }

  function signOut() {
    fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' })
      .then(response => {
        if (!response.ok) throw new Error('Sign out request failed.');
        location.href = '/';
      })
      .catch(error => console.error('Unable to sign out.', error));
  }

  return (
    <div className="situation-shell">
      <aside className="situation-rail">
        <Link href="/" className="situation-brand" aria-label="UVoice South Sudan home">
          <span className="situation-brand-mark">◈</span><span>UVOICE<small>SOUTH SUDAN</small></span>
        </Link>
        <div className="situation-workspace">
          <div className="situation-workspace-mark"><Layers size={23}/></div>
          <div className="situation-workspace-copy"><strong>Situation Room</strong><small>National operations</small></div>
        </div>
        <div className="situation-identity"><span className="situation-online-dot"/> Signed in as
          <strong>{user?.displayName || 'UVoice visitor'}</strong><small>{user?.role?.replaceAll('_', ' ') || 'PUBLIC ACCESS'}</small>
        </div>
        <Link className="situation-add-report" href="/report" aria-label="Add new report"><Plus size={19}/> Add new report</Link>
        <nav className="situation-nav" aria-label="Situation room">
          {links.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href === '/cases' && pathname.startsWith('/cases/'));
            return <Link key={item.href} href={item.href} className={`situation-nav-link${active ? ' active' : ''}`} aria-label={item.label} aria-current={active ? 'page' : undefined}>
              <Icon size={19}/><span>{item.label}</span>
            </Link>;
          })}
        </nav>
        <div className="situation-nav-bottom">
          {user ? <button className="situation-nav-link situation-logout" aria-label="Sign out" onClick={signOut}><LogOut size={19}/><span>Sign out</span></button>
            : <Link className="situation-nav-link" href="/login" aria-label="Sign in"><LogOut size={19}/><span>Sign in</span></Link>}
        </div>
        <div className="situation-rail-footer">UVoice · Operational workspace</div>
      </aside>
      <section className="situation-main">
        <header className="situation-topbar">
          <div className="situation-search situation-global-search">
            <Search size={19}/><input aria-label="Find a workspace" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a workspace"/>
            {searchResults.length > 0 && <div className="situation-search-results">{searchResults.map(item => <Link key={item.href} href={item.href} onClick={() => setSearch('')}>{item.label}</Link>)}</div>}
          </div>
          <div className="situation-top-actions">
            {toolbar}
            <button className="situation-share-button" onClick={() => void share()}><span>{shareMessage || 'Share'}</span><Share2 size={16}/></button>
            {user && <span className="situation-user-chip" title={user.role}>{user.displayName}</span>}
          </div>
        </header>
        <div className="situation-workspace-content">{children}</div>
      </section>
    </div>
  );
}
