'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SituationRoomShell from '../components/situation-room-shell';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const ROLES = ['REPORTER', 'JOURNALIST', 'CSO_MONITOR', 'FIELD_VERIFIER', 'ANALYST', 'RESPONSE_OFFICER', 'ORG_COORDINATOR', 'SUPERVISOR', 'ADMIN', 'AUDITOR', 'EXECUTIVE'];
type Organization = { id: string; name: string; description: string | null; contactEmail: string | null };
type User = { id: string; displayName: string; username: string; email: string; status: string; role: string };

export default function Admin() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [organizationResponse, userResponse] = await Promise.all([
        fetch(`${API}/organizations/pending`, { credentials: 'include' }),
        fetch(`${API}/admin/users`, { credentials: 'include' }),
      ]);
      const [organizationData, userData] = await Promise.all([organizationResponse.json(), userResponse.json()]);
      if (!organizationResponse.ok) throw new Error(organizationData.message || 'Administrator access required.');
      if (!userResponse.ok) throw new Error(userData.message || 'Unable to load users.');
      setOrganizations(organizationData);
      setUsers(userData);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load administration data.'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function approve(id: string) {
    try {
      const response = await fetch(`${API}/organizations/${id}/approve`, { credentials: 'include', method: 'PATCH' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to approve organisation.');
      setMessage('Organisation approved.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to approve organisation.'); }
  }

  async function setRole(id: string, role: string) {
    try {
      const response = await fetch(`${API}/admin/users/${id}/role`, {
        credentials: 'include', method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to update user role.');
      setMessage('User role updated.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update user role.'); }
  }

  return <SituationRoomShell><main className="container" style={{ paddingTop: 40, paddingBottom: 70 }}>
    <Link href="/dashboard" className="brand">← UVOICE</Link>
    <h1 style={{ marginTop: 24 }}>Administration</h1>
    <p className="muted">Organisation approvals and user role administration. Actions are recorded in the audit log.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
    <section className="card" style={{ marginTop: 20 }}>
      <h2>Pending organisations ({organizations.length})</h2>
      {organizations.length ? organizations.map(organization => <div className="adminrow" key={organization.id}>
        <div><strong>{organization.name}</strong><p className="muted">{organization.description || 'No description'} · {organization.contactEmail || 'No contact email'}</p></div>
        <button className="btn" onClick={() => void approve(organization.id)}>Approve</button>
      </div>) : <p className="muted">No pending organisation requests.</p>}
    </section>
    <section className="card" style={{ marginTop: 20 }}>
      <h2>User access and roles ({users.length})</h2>
      <div className="tablewrap"><table><thead><tr><th>User</th><th>Email</th><th>Status</th><th>Role</th></tr></thead><tbody>
        {users.map(user => <tr key={user.id}>
          <td>{user.displayName}<br/><small className="muted">@{user.username}</small></td>
          <td>{user.email}</td><td>{user.status}</td>
          <td><select value={user.role} onChange={event => void setRole(user.id, event.target.value)}>{ROLES.map(role => <option key={role}>{role}</option>)}</select></td>
        </tr>)}
      </tbody></table></div>
    </section>
  </main></SituationRoomShell>;
}
