/**
 * Dashboard page component displaying real-time request streaming and pipeline views.
 * Visualizes active incoming HTTP requests as they process through the gateway.
 * Exports LiveRequestsPage component.
 */

import React, { useState } from 'react';
import TopBar from '../components/layout/TopBar';
import LiveIndicator from '../components/shared/LiveIndicator';
import RequestTimeline from '../components/requests/RequestTimeline';
import { useLiveRequests } from '../hooks/useLiveRequests';
import { Pause, Play, Trash2, Filter } from 'lucide-react';

const METHODS  = ['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const SERVICES = ['ALL', 'auth-service', 'product-service', 'payment-service', 'order-service', 'gateway'];

export default function LiveRequestsPage() {
  const { requests, connected, paused, togglePause, clear } = useLiveRequests();

  const [methodFilter,  setMethodFilter]  = useState('ALL');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [statusFilter,  setStatusFilter]  = useState('ALL');

  const filtered = requests.filter((r) => {
    if (methodFilter  !== 'ALL' && r.method  !== methodFilter)  return false;
    if (serviceFilter !== 'ALL' && r.service !== serviceFilter) return false;
    if (statusFilter === '2xx' && (r.statusCode < 200 || r.statusCode >= 300)) return false;
    if (statusFilter === '4xx' && (r.statusCode < 400 || r.statusCode >= 500)) return false;
    if (statusFilter === '5xx' && r.statusCode < 500) return false;
    return true;
  });

  return (
    <>
      <TopBar
        title="Live Requests"
        subtitle="Real-time request stream from the gateway"
        actions={<LiveIndicator connected={connected} />}
      />

      <main className="page-main animate-fade-in">

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <div className="controls-row">
              <button
                className={`btn btn-sm ${paused ? 'btn-success' : 'btn-ghost'}`}
                onClick={togglePause}
              >
                {paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
              </button>

              <button className="btn btn-ghost btn-sm" onClick={clear}>
                <Trash2 size={13} /> Clear
              </button>

              <div className="divider" style={{ width: 1, height: 20, margin: '0 4px' }} />

              <Filter size={13} style={{ color: 'var(--text-muted)' }} />

              <select
                className="select"
                style={{ width: 100 }}
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
              >
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>

              <select
                className="select"
                style={{ width: 140 }}
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
              >
                {SERVICES.map((s) => <option key={s}>{s}</option>)}
              </select>

              <select
                className="select"
                style={{ width: 100 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {['ALL', '2xx', '4xx', '5xx'].map((s) => <option key={s}>{s}</option>)}
              </select>

              <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                Showing {filtered.length} / {requests.length} requests
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ overflow: 'hidden', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          <RequestTimeline requests={filtered} />
        </div>
      </main>
    </>
  );
}
