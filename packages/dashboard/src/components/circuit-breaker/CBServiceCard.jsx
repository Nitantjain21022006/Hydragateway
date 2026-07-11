import React, { useEffect, useRef, useState } from 'react';
import { CBStateBadge } from '../shared/StatusBadge';
import { Clock, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

function CBStateRing({ state }) {
  const s = (state || 'CLOSED').toUpperCase().replace('-', '_');
  const cls = {
    CLOSED:    'closed',
    OPEN:      'open',
    HALF_OPEN: 'half_open',
  }[s] || 'closed';

  const label = { CLOSED: '●', OPEN: '●', HALF_OPEN: '◐' }[s] || '●';

  return (
    <div className={`cb-ring ${cls}`}>
      <div className="cb-dot" />
    </div>
  );
}

function RecoveryTimer({ nextAttemptTime }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!nextAttemptTime) return;

    const update = () => {
      const diff = Math.max(0, nextAttemptTime - Date.now());
      setRemaining(Math.ceil(diff / 1000));
    };

    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [nextAttemptTime]);

  if (!nextAttemptTime || remaining <= 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11, color: 'var(--amber)', marginTop: 6
    }}>
      <Clock size={11} />
      <span>Recovery in {remaining}s</span>
    </div>
  );
}

export default function CBServiceCard({ name, data }) {
  const prevState = useRef(data?.state);
  const [flashing, setFlashing] = useState(false);

  const state = (data?.state || 'CLOSED').toUpperCase().replace('-', '_');

  useEffect(() => {
    if (prevState.current && prevState.current !== state) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 700);
      prevState.current = state;
      return () => clearTimeout(t);
    }
    prevState.current = state;
  }, [state]);

  const failureCount  = data?.failureCount  || 0;
  const successCount  = data?.successCount  || 0;
  const threshold     = data?.threshold     || parseInt(import.meta.env.VITE_CB_THRESHOLD || '5', 10);
  const lastFailure   = data?.lastFailureTime;
  const nextAttempt   = data?.nextAttemptTime;

  const failurePct    = Math.min((failureCount / threshold) * 100, 100);

  const accentColor = {
    CLOSED:    'var(--emerald)',
    OPEN:      'var(--rose)',
    HALF_OPEN: 'var(--amber)',
  }[state] || 'var(--emerald)';

  const displayName = name
    .replace('-service', '')
    .replace('-', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      className={`card ${flashing ? 'cb-card-transition' : ''}`}
      style={{
        borderColor: flashing ? accentColor : undefined,
        transition: 'border-color 0.3s ease',
      }}
    >
      <div className="card-header">
        <div className="flex-center gap-3">
          <CBStateRing state={state} />
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
              {displayName}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{name}</p>
          </div>
        </div>
        <CBStateBadge state={state} />
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Failure bar */}
        <div>
          <div className="flex-between" style={{ marginBottom: 6, fontSize: 11 }}>
            <span style={{ color: 'var(--text-muted)' }}>Failure count</span>
            <span style={{ color: failureCount > 0 ? 'var(--rose)' : 'var(--text-muted)', fontWeight: 600 }}>
              {failureCount} / {threshold}
            </span>
          </div>
          <div className="failure-bar">
            <div
              className="failure-bar-fill"
              style={{
                width: `${failurePct}%`,
                background: failurePct > 60
                  ? 'var(--rose)'
                  : failurePct > 30
                  ? 'var(--amber)'
                  : 'var(--emerald)',
              }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
          }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
              Successes
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--emerald)' }}>
              {successCount}
            </p>
          </div>
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
          }}>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
              Failures
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, color: failureCount > 0 ? 'var(--rose)' : 'var(--text-primary)' }}>
              {failureCount}
            </p>
          </div>
        </div>

        {/* Last failure */}
        {lastFailure && (
          <div className="flex-center gap-2" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <AlertCircle size={11} style={{ color: 'var(--rose)' }} />
            <span>Last failure: {new Date(lastFailure).toLocaleTimeString()}</span>
          </div>
        )}

        {/* Recovery timer */}
        {state === 'OPEN' && <RecoveryTimer nextAttemptTime={nextAttempt} />}

        {/* HALF_OPEN notice */}
        {state === 'HALF_OPEN' && (
          <div className="flex-center gap-2" style={{ fontSize: 11, color: 'var(--amber)' }}>
            <RefreshCw size={11} />
            <span>Probe mode – testing recovery</span>
          </div>
        )}
      </div>
    </div>
  );
}
