'use client';
import { useState } from 'react';
import SituationRoomShell from '../components/situation-room-shell';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export default function Organizations() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${API}/organizations`, {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, contactEmail: email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to submit organisation.');
      setMessage(data.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit organisation.'); }
  }

  return <SituationRoomShell><main className="workspace-form-page">
    <div className="workspace-page-heading"><div><div className="eyebrow">PARTNER NETWORK</div><h1>Organizations</h1><p className="muted">Request an approved workspace for your civil society organization, newsroom, or response institution.</p></div></div>
    <div className="workspace-form-layout">
      <section className="card">
        <h2>Register an organisation</h2>
        <p className="muted">Access remains inactive until approved by a platform administrator.</p>
        {message && <p className="success" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <form onSubmit={submit}>
          <label>Organisation name<input required value={name} onChange={event => setName(event.target.value)}/></label>
          <label>Description<textarea rows={4} value={description} onChange={event => setDescription(event.target.value)}/></label>
          <label>Official contact email<input type="email" value={email} onChange={event => setEmail(event.target.value)}/></label>
          <button className="btn">Submit for approval</button>
        </form>
      </section>
      <aside className="card workspace-info-card"><h2>Approval process</h2><p className="muted">An administrator reviews organisation requests before operational access is enabled. Submit an official contact email so the review team can follow up.</p></aside>
    </div>
  </main></SituationRoomShell>;
}
