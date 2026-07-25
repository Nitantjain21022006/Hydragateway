/**
 * Interactive dashboard page component for generating synthetic traffic loads.
 * Allows triggering test traffic patterns to test rate limiting and circuit breakers.
 * Exports LoadGeneratorPage component.
 */

import React, { useState, useCallback, useEffect } from 'react';
import TopBar from '../components/layout/TopBar';
import { useLoadGenerator, resolveTargetUrl } from '../hooks/useLoadGenerator';
import { LOAD_BALANCER_URL, GATEWAY_1_URL, GATEWAY_2_URL } from '../context/GatewayContext';
import api from '../services/axios';
import {
  Play, Square, ChevronDown, ChevronUp, AlertCircle,
  Zap, CheckCircle2, XCircle, Lock, RefreshCw, Shuffle,
  Server, ArrowRight
} from 'lucide-react';

const FALLBACK_USER_ID = '000000000000000000000001';

function getUserIdFromToken(token) {
  try {
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id || payload.userId || payload.sub || null;
  } catch {
    return null;
  }
}

const PRODUCT_SERVICE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const ORDER_BODY_TEMPLATE = (productId, userId) => JSON.stringify({
  userId: userId || FALLBACK_USER_ID,
  items: [{ productId, quantity: 1 }],
  shippingAddress: { street: '123 Main St', city: 'Metropolis', country: 'USA' },
  paymentMethod: 'CREDIT_CARD'
}, null, 2);

const ENDPOINTS = [
  { label: 'GET /v1/products',        value: '/v1/products',        method: 'GET'  },
  { label: 'GET /v1/products/:id',    value: '/v1/products/1',      method: 'GET'  },
  {
    label: 'POST /v1/orders',
    value: '/v1/orders',
    method: 'POST',
    needsProductId: true,
    body: ORDER_BODY_TEMPLATE('FETCHING...')
  },
  { label: 'GET /v1/orders',          value: '/v1/orders',          method: 'GET'  },
  { label: 'GET /v1/payments',        value: '/v1/payments',        method: 'GET'  },

  { label: 'GET /health',             value: '/health',             method: 'GET'  },
  { label: 'GET /analytics/summary',  value: '/analytics/summary',  method: 'GET'  },
];

const TRAFFIC_TARGETS = [
  {
    value:  'lb',
    label:  'Load Balancer',
    sub:    'Round-Robin :8080',
    color:  'var(--purple)',
    icon:   Shuffle,
    desc:   'Requests are distributed alternately: req 1→GW1, req 2→GW2, …',
  },
  {
    value:  'gw1',
    label:  'Gateway 1',
    sub:    'Direct :3000',
    color:  'var(--blue)',
    icon:   Server,
    desc:   'All requests go only to Gateway 1 (port 3000)',
  },
  {
    value:  'gw2',
    label:  'Gateway 2',
    sub:    'Direct :3001',
    color:  'var(--cyan)',
    icon:   Server,
    desc:   'All requests go only to Gateway 2 (port 3001)',
  },
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

function GatewayHealthBadge({ id, healthy, target }) {
  const color  = healthy === true  ? 'var(--emerald)'
               : healthy === false ? 'var(--rose)'
               : 'var(--text-muted)';
  const dot    = healthy === true  ? '●'
               : healthy === false ? '✖'
               : '○';
  const label  = healthy === true  ? 'UP'
               : healthy === false ? 'DOWN'
               : '...';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, color,
      padding: '2px 7px', borderRadius: 4,
      border: `1px solid ${color}44`,
      background: `${color}11`,
    }}>
      {dot} {id} {label}
    </span>
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

  const [showBody,         setShowBody]         = useState(false);
  const [showHeaders,      setShowHeaders]       = useState(false);
  const [showAuth,         setShowAuth]          = useState(false);
  const [productIdStatus,  setProductIdStatus]   = useState(null); 

  const [lbHealth, setLbHealth] = useState(null); 
  const [lbHealthLoading, setLbHealthLoading] = useState(false);

  const progress = derived.progress;

  const probeLbHealth = useCallback(async () => {
    setLbHealthLoading(true);
    try {
      const res = await fetch(`${LOAD_BALANCER_URL}/lb-health`);
      const json = await res.json();
      setLbHealth(json);
    } catch {
      setLbHealth(null);
    } finally {
      setLbHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (config.targetMode !== 'lb') {
      setLbHealth(null);
      return;
    }
    probeLbHealth();
    const id = setInterval(probeLbHealth, 5000);
    return () => clearInterval(id);
  }, [config.targetMode, probeLbHealth]);

  const fetchAndInjectProductId = useCallback(async () => {
    setProductIdStatus('loading');
    try {

      const res = await fetch(`${PRODUCT_SERVICE_URL}/v1/products`);
      const json = await res.json();
      const products = json?.data?.products || json?.data || [];
      const active = Array.isArray(products)
        ? products.find((p) => p.isActive !== false) || products[0]
        : null;
      const productId = active?._id || active?.id;
      if (!productId) {
        setProductIdStatus('error');
        return;
      }

      const token = config.authToken || localStorage.getItem('load_gen_token') || '';
      const userId = getUserIdFromToken(token) || FALLBACK_USER_ID;
      setConfig((c) => ({ ...c, body: ORDER_BODY_TEMPLATE(productId, userId) }));
      setProductIdStatus('ok');
    } catch {
      setProductIdStatus('error');
    }
  }, [setConfig, config.authToken]);

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

      if (preset.needsProductId) {
        fetchAndInjectProductId();
      } else {
        setProductIdStatus(null);
      }
    } else {
      setConfig((c) => ({ ...c, endpoint: e.target.value }));
      setProductIdStatus(null);
    }
  };

  const currentTarget = TRAFFIC_TARGETS.find((t) => t.value === config.targetMode) || TRAFFIC_TARGETS[0];
  const resolvedUrl   = resolveTargetUrl(config.targetMode);

  return (
    <>
      <TopBar
        title="Load Generator"
        subtitle="Generate real traffic through the gateway from the browser"
      />

      <main className="page-main animate-fade-in">
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, alignItems: 'start' }}>

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

              <div>
                <label style={{
                  fontSize: 11, color: 'var(--text-muted)', display: 'block',
                  marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.6px'
                }}>
                  Traffic Target
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {TRAFFIC_TARGETS.map((t) => {
                    const Icon = t.icon;
                    const active = config.targetMode === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setConfig((c) => ({ ...c, targetMode: t.value }))}
                        disabled={running}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          gap: 4, padding: '8px 4px',
                          borderRadius: 'var(--radius-sm)',
                          border: active ? `2px solid ${t.color}` : '2px solid var(--border-color)',
                          background: active ? `${t.color}18` : 'transparent',
                          color: active ? t.color : 'var(--text-muted)',
                          cursor: running ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease',
                          opacity: running ? 0.5 : 1,
                        }}
                      >
                        <Icon size={14} />
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.3px' }}>{t.label}</span>
                        <span style={{ fontSize: 9, opacity: 0.7 }}>{t.sub}</span>
                      </button>
                    );
                  })}
                </div>

                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: `${currentTarget.color}0D`,
                  border: `1px solid ${currentTarget.color}33`,
                  fontSize: 10,
                  color: currentTarget.color,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                    <ArrowRight size={10} />
                    {currentTarget.desc}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', opacity: 0.8, fontSize: 9 }}>
                    {resolvedUrl}{config.endpoint}
                  </span>

                  {config.targetMode === 'lb' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {lbHealthLoading && !lbHealth && (
                        <span style={{ fontSize: 9, opacity: 0.6 }}>Checking gateways…</span>
                      )}
                      {lbHealth?.gateways?.map((gw) => (
                        <GatewayHealthBadge
                          key={gw.id}
                          id={gw.id}
                          healthy={gw.healthy}
                          target={gw.target}
                        />
                      ))}
                      {!lbHealth && !lbHealthLoading && (
                        <span style={{ fontSize: 9, color: 'var(--rose)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertCircle size={9} />
                          LB unreachable — is it running on :8080?
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

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

                {productIdStatus === 'loading' && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                    Fetching a real product ID from the API…
                  </div>
                )}
                {productIdStatus === 'ok' && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--emerald)' }}>
                    ✓ Product ID injected into request body automatically.
                  </div>
                )}
                {productIdStatus === 'error' && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--rose)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={11} />
                    Could not fetch a product ID. Replace FETCHING... in the body manually.
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 10, padding: '2px 6px', height: 'auto', minHeight: 0 }}
                      onClick={fetchAndInjectProductId}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

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

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={config.autoAuth}
                        onChange={(e) => setConfig((c) => ({ ...c, autoAuth: e.target.checked }))}
                        disabled={running}
                      />
                      <span>Auto-Authenticate on Start</span>
                    </label>

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
                          onClick={() => loginOrRegister(
                            config.authEmail,
                            config.authPassword,
                            resolveTargetUrl(config.targetMode)
                          )}
                          disabled={running || authStatus.status === 'loading'}
                        >
                          {authStatus.status === 'loading' ? 'Logging in...' : 'Login / Register'}
                        </button>
                      </div>
                    </div>

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
