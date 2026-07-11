import React, { useState } from 'react';
import TopBar from '../components/layout/TopBar';
import { useLoadGenerator } from '../hooks/useLoadGenerator';
import {
  Play, Square, ChevronDown, ChevronUp, AlertCircle,
  Zap, CheckCircle2, XCircle, Lock
} from 'lucide-react';

const ENDPOINTS = [
  { label: 'GET /v1/products',        value: '/v1/products',        method: 'GET'  },
  { label: 'GET /v1/products/:id',    value: '/v1/products/1',      method: 'GET'  },
  {
    label: 'POST /v1/orders',
    value: '/v1/orders',
    method: 'POST',
    body: JSON.stringify({
      userId: "user_load_test",
      items: [{ productId: "replace_with_active_product_id", quantity: 1 }],
      shippingAddress: { street: "123 Main St", city: "Metropolis", country: "USA" },
      paymentMethod: "CREDIT_CARD"
    }, null, 2)
  },
  { label: 'GET /v1/orders',          value: '/v1/orders',          method: 'GET'  },
  { label: 'GET /v1/payments',        value: '/v1/payments',        method: 'GET'  },
  {
    label: 'POST /v1/auth/register',
    value: '/v1/auth/register',
    method: 'POST',
    body: JSON.stringify({
      name: "Load Test User",
      email: "test@example.com",
      password: "Password123"
    }, null, 2)
  },
  {
    label: 'POST /v1/auth/login',
    value: '/v1/auth/login',
    method: 'POST',
    body: JSON.stringify({
      email: "test@example.com",
      password: "Password123"
    }, null, 2)
  },
  { label: 'GET /health',             value: '/health',             method: 'GET'  },
  { label: 'GET /analytics/summary',  value: '/analytics/summary',  method: 'GET'  },
];

function StatBox({ label, value, color = 'var(--text-primary)', mono = false }) {
  return (
    <div className="card" style={{ padding: '14px 18px', textAlign: 'center' }}>
      <p style={{
        fontSize: 26,
        fontWeight: 800,
        color,
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
        letterSpacing: '-0.5px',
        lineHeight: 1,
        marginBottom: 6,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </p>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
        {label}
      </p>
    </div>
  );
}

export default function LoadGeneratorPage() {
  const {
    config,
    setConfig,
    running,
    stats,
    derived,
    results,
    start,
    stop,
    authStatus,
    loginOrRegister,
    clearSession
  } = useLoadGenerator();
  const [showBody,    setShowBody]    = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const [showAuth,    setShowAuth]    = useState(false);

  const progress = derived.progress;

  const handleEndpointPreset = (e) => {
    const preset = ENDPOINTS.find((ep) => ep.value === e.target.value);
    if (preset) {
      setConfig((c) => ({
        ...c,
        endpoint: preset.value,
        method: preset.method,
        body: preset.body || ''
      }));
      if (preset.method === 'POST') {
        setShowBody(true);
      }
    } else {
      setConfig((c) => ({ ...c, endpoint: e.target.value }));
    }
  };

  return (
    <>
      <TopBar
        title="Load Generator"
        subtitle="Generate real traffic through the gateway from the browser"
      />

      <main className="page-main animate-fade-in">
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start' }}>
          {/* ── Config Panel ──────────────────────────────────────── */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Configuration</span>
              {running && (
                <span className="badge badge-method-post" style={{ animation: 'live-blink 0.8s infinite' }}>
                  RUNNING
                </span>
              )}
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Endpoint preset */}
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Endpoint Preset
                </label>
                <select className="select" onChange={handleEndpointPreset} disabled={running}>
                  <option value="">— Select preset —</option>
                  {ENDPOINTS.map((ep) => (
                    <option key={ep.value + ep.method} value={ep.value}>{ep.label}</option>
                  ))}
                </select>
              </div>

              {/* Method + custom endpoint */}
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Method</label>
                  <select
                    className="select"
                    value={config.method}
                    onChange={(e) => setConfig((c) => ({ ...c, method: e.target.value }))}
                    disabled={running}
                  >
                    {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Path</label>
                  <input
                    className="input"
                    value={config.endpoint}
                    onChange={(e) => setConfig((c) => ({ ...c, endpoint: e.target.value }))}
                    disabled={running}
                    placeholder="/v1/products"
                  />
                </div>
              </div>

              {/* Requests + Concurrency */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Total Requests
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="10000"
                    value={config.total}
                    onChange={(e) => setConfig((c) => ({ ...c, total: e.target.value }))}
                    disabled={running}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Concurrency
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="100"
                    value={config.concurrency}
                    onChange={(e) => setConfig((c) => ({ ...c, concurrency: e.target.value }))}
                    disabled={running}
                  />
                </div>
              </div>

              {/* Batch delay */}
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Delay Between Batches (ms)
                </label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="10000"
                  value={config.batchDelay}
                  onChange={(e) => setConfig((c) => ({ ...c, batchDelay: e.target.value }))}
                  disabled={running}
                />
              </div>

              {/* Authentication Settings Accordion */}
              <div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', justifyContent: 'space-between', color: config.authToken ? 'var(--emerald)' : 'var(--text-primary)' }}
                  onClick={() => setShowAuth((a) => !a)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Lock size={13} style={{ color: config.authToken ? 'var(--emerald)' : 'var(--text-muted)' }} />
                    Authentication Settings
                  </span>
                  {showAuth ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                
                {showAuth && (
                  <div style={{
                    marginTop: 8,
                    padding: 12,
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}>
                    {/* Auto-Authenticate Checkbox */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={config.autoAuth}
                        onChange={(e) => setConfig((c) => ({ ...c, autoAuth: e.target.checked }))}
                        disabled={running}
                      />
                      <span>Auto-Authenticate on Start</span>
                    </label>

                    {/* Email/Password Fields */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      paddingTop: 8,
                      borderTop: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div>
                        <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Email
                        </label>
                        <input
                          className="input"
                          style={{ fontSize: 12, height: 32, padding: '4px 8px' }}
                          value={config.authEmail}
                          onChange={(e) => setConfig((c) => ({ ...c, authEmail: e.target.value }))}
                          disabled={running}
                          placeholder="test@example.com"
                        />
                      </div>
                      
                      <div>
                        <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Password
                        </label>
                        <input
                          className="input"
                          type="password"
                          style={{ fontSize: 12, height: 32, padding: '4px 8px' }}
                          value={config.authPassword}
                          onChange={(e) => setConfig((c) => ({ ...c, authPassword: e.target.value }))}
                          disabled={running}
                          placeholder="••••••••"
                        />
                      </div>

                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 10, flex: 1, padding: '4px 6px', height: 'auto', minHeight: 0 }}
                          onClick={() => setConfig((c) => ({ ...c, authEmail: 'test@example.com', authPassword: 'Password123' }))}
                          disabled={running}
                        >
                          Fill Demo
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: 10, flex: 1, padding: '4px 6px', height: 'auto', minHeight: 0 }}
                          onClick={() => loginOrRegister(config.authEmail, config.authPassword)}
                          disabled={running || authStatus.status === 'loading'}
                        >
                          {authStatus.status === 'loading' ? 'Logging in...' : 'Login / Register'}
                        </button>
                      </div>
                    </div>

                    {/* Feedback Messages */}
                    {authStatus.message && (
                      <div style={{
                        fontSize: 10,
                        padding: '6px 8px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: authStatus.status === 'success' ? 'rgba(16,185,129,0.1)' : authStatus.status === 'error' ? 'rgba(244,63,94,0.1)' : 'rgba(59,130,246,0.1)',
                        color: authStatus.status === 'success' ? 'var(--emerald)' : authStatus.status === 'error' ? 'var(--rose)' : 'var(--blue)',
                        border: `1px solid ${authStatus.status === 'success' ? 'rgba(16,185,129,0.2)' : authStatus.status === 'error' ? 'rgba(244,63,94,0.2)' : 'rgba(59,130,246,0.2)'}`,
                      }}>
                        {authStatus.message}
                      </div>
                    )}

                    {/* Token override */}
                    <div style={{
                      paddingTop: 8,
                      borderTop: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Active JWT Token
                        </label>
                        {config.authToken && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 9, padding: '1px 4px', height: 'auto', minHeight: 0, color: 'var(--rose)' }}
                            onClick={clearSession}
                            disabled={running}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <textarea
                        className="textarea"
                        style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', minHeight: 50, padding: 6 }}
                        value={config.authToken}
                        onChange={(e) => setConfig((c) => ({ ...c, authToken: e.target.value }))}
                        disabled={running}
                        placeholder="No active token. Auto-auth or sign in above to populate."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Headers toggle */}
              <div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', justifyContent: 'space-between' }}
                  onClick={() => setShowHeaders((h) => !h)}
                >
                  <span>Custom Headers</span>
                  {showHeaders ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {showHeaders && (
                  <textarea
                    className="textarea"
                    style={{ marginTop: 8 }}
                    value={config.headers}
                    onChange={(e) => setConfig((c) => ({ ...c, headers: e.target.value }))}
                    disabled={running}
                    placeholder='{ "X-Custom": "value" }'
                  />
                )}
              </div>

              {/* Body toggle (POST/PUT) */}
              {['POST', 'PUT', 'PATCH'].includes(config.method) && (
                <div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'space-between' }}
                    onClick={() => setShowBody((b) => !b)}
                  >
                    <span>Request Body</span>
                    {showBody ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {showBody && (
                    <textarea
                      className="textarea"
                      style={{ marginTop: 8, minHeight: 120 }}
                      value={config.body}
                      onChange={(e) => setConfig((c) => ({ ...c, body: e.target.value }))}
                      disabled={running}
                      placeholder='{ "name": "Test Product", "price": 99 }'
                    />
                  )}
                </div>
              )}

              {/* Rate limit warning */}
              <div style={{
                background: 'var(--amber-dim)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                fontSize: 11,
                color: 'var(--amber)',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}>
                <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Non-analytics routes are rate-limited to 100 req/min per IP. The generator will trigger 429s on high concurrency.</span>
              </div>

              {/* Start / Stop */}
              {!running ? (
                <button className="btn btn-success" style={{ width: '100%' }} onClick={start}>
                  <Play size={14} /> Start Load Test
                </button>
              ) : (
                <button className="btn btn-danger" style={{ width: '100%' }} onClick={stop}>
                  <Square size={14} /> Stop
                </button>
              )}
            </div>
          </div>

          {/* ── Stats Panel ───────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Progress */}
            {(running || stats.startTime) && (
              <div className="card">
                <div className="card-body">
                  <div className="flex-between" style={{ marginBottom: 10, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Progress</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {stats.completed.toLocaleString()} / {config.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    {progress.toFixed(1)}% complete · {derived.reqPerSec} req/s
                  </div>
                </div>
              </div>
            )}

            {/* KPI Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <StatBox label="Sent"        value={stats.sent.toLocaleString()}       color="var(--blue)" />
              <StatBox label="Completed"   value={stats.completed.toLocaleString()}  color="var(--text-primary)" />
              <StatBox label="Failed"      value={stats.failed.toLocaleString()}     color={stats.failed > 0 ? 'var(--rose)' : 'var(--text-muted)'} />
              <StatBox label="Success Rate" value={`${derived.successRate}%`}        color="var(--emerald)" />
              <StatBox label="Error Rate"  value={`${derived.errorRate}%`}           color={parseFloat(derived.errorRate) > 0 ? 'var(--rose)' : 'var(--text-muted)'} />
              <StatBox label="Req/s"       value={derived.reqPerSec}                 color="var(--cyan)" mono />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <StatBox label="Avg Latency" value={`${derived.avgLatency}ms`} color="var(--purple)" mono />
              <StatBox label="Min Latency" value={`${derived.minLatency}ms`} color="var(--emerald)" mono />
              <StatBox label="Max Latency" value={`${derived.maxLatency}ms`} color={derived.maxLatency > 500 ? 'var(--rose)' : 'var(--amber)'} mono />
            </div>

            {/* Results table (last 20) */}
            {results.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Recent Results</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>last {Math.min(results.length, 20)}</span>
                </div>
                <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Status</th>
                        <th>Latency</th>
                        <th>Result</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.slice(-20).reverse().map((r, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                            {results.length - i}
                          </td>
                          <td>
                            <span className={`badge badge-status-${r.status < 300 ? '2xx' : r.status < 400 ? '3xx' : r.status < 500 ? '4xx' : '5xx'}`}>
                              {r.status || 'ERR'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                            {r.latencyMs}ms
                          </td>
                          <td>
                            {r.success
                              ? <CheckCircle2 size={13} style={{ color: 'var(--emerald)' }} />
                              : <XCircle     size={13} style={{ color: 'var(--rose)' }} />}
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty hint */}
            {!running && !stats.startTime && (
              <div className="card">
                <div className="empty-state">
                  <Zap size={32} style={{ color: 'var(--amber)', opacity: 0.7 }} />
                  <div>
                    <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Ready to generate load</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>
                      Configure your test and click Start. All requests will be visible on the Live Requests page.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
