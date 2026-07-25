/**
 * Dashboard page component providing real-time log tailing and streaming views.
 * Renders interactive log viewer with filtering and search capabilities.
 * Exports LiveLogsPage component.
 */

import React, { useState } from 'react';
import TopBar from '../components/layout/TopBar';
import LiveIndicator from '../components/shared/LiveIndicator';
import LogViewer from '../components/logs/LogViewer';
import { useLiveLogs } from '../hooks/useLiveLogs';
import { Pause, Play, Trash2, Search } from 'lucide-react';

const LEVELS   = ['all', 'error', 'warn', 'info', 'debug'];
const SERVICES = ['all', 'gateway', 'gateway-analytics', 'gateway-ratelimit', 'gateway-auth', 'gateway-cache', 'gateway-proxy', 'gateway-error'];

export default function LiveLogsPage() {
  const [levelFilter,   setLevelFilter]   = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [search,        setSearch]        = useState('');
  const [autoScroll,    setAutoScroll]    = useState(true);

  const filters = {
    level:   levelFilter   !== 'all' ? levelFilter   : undefined,
    service: serviceFilter !== 'all' ? serviceFilter : undefined,
  };

  const { logs, connected, paused, togglePause, clear } = useLiveLogs(filters);

  const filtered = search
    ? logs.filter((l) =>
        (l.message || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.service  || '').toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  return (
    <>
      <TopBar
        title="Live Logs"
        subtitle="Streaming gateway application logs"
        actions={<LiveIndicator connected={connected} />}
      />

      <main className="page-main animate-fade-in">

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-body" style={{ paddingTop: 12, paddingBottom: 12 }}>
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

              <div className="flex-center gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    className={`btn btn-sm ${levelFilter === l ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ textTransform: 'uppercase', fontSize: 10, padding: '4px 8px' }}
                    onClick={() => setLevelFilter(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div className="divider" style={{ width: 1, height: 20, margin: '0 4px' }} />

              <select
                className="select"
                style={{ width: 170 }}
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
              >
                {SERVICES.map((s) => <option key={s}>{s}</option>)}
              </select>

              <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                <Search size={13} style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }} />
                <input
                  className="input"
                  style={{ paddingLeft: 30 }}
                  placeholder="Search logs…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <label className="flex-center gap-2" style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  style={{ accentColor: 'var(--blue)' }}
                />
                Auto-scroll
              </label>

              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {filtered.length} entries
              </span>
            </div>
          </div>
        </div>

        <LogViewer logs={filtered} autoScroll={autoScroll && !paused} />
      </main>
    </>
  );
}
