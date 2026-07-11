import React from 'react';
import { CheckCircle2, AlertCircle, Wifi, Clock } from 'lucide-react';
import { HealthBadge } from '../shared/StatusBadge';

export default function ServiceCard({ service }) {
  const { name, status, healthy, cbState, cbFailures } = service;
  const isHealthy = healthy !== false && status !== 'down';

  const displayName = name
    .replace('-service', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="card" style={{
      borderColor: isHealthy ? 'var(--border-subtle)' : 'rgba(244,63,94,0.3)',
    }}>
      <div className="card-header">
        <div className="flex-center gap-3">
          <div style={{
            width: 34, height: 34,
            borderRadius: '50%',
            background: isHealthy ? 'var(--emerald-dim)' : 'var(--rose-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {isHealthy
              ? <CheckCircle2 size={16} style={{ color: 'var(--emerald)' }} />
              : <AlertCircle  size={16} style={{ color: 'var(--rose)' }} />
            }
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
              {displayName}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{name}</p>
          </div>
        </div>
        <HealthBadge status={isHealthy ? 'healthy' : 'down'} />
      </div>

      <div className="card-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ fontSize: 12 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Circuit Breaker</p>
            <p style={{
              color: cbState === 'OPEN' ? 'var(--rose)' : cbState === 'HALF_OPEN' ? 'var(--amber)' : 'var(--emerald)',
              fontWeight: 600,
            }}>
              {cbState || 'CLOSED'}
            </p>
          </div>
          <div style={{ fontSize: 12 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.6px' }}>CB Failures</p>
            <p style={{ color: cbFailures > 0 ? 'var(--rose)' : 'var(--text-secondary)', fontWeight: 600 }}>
              {cbFailures ?? 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GatewayCard({ gateway }) {
  const { id, target, healthy, consecutiveFailures, consecutiveSuccesses } = gateway;

  return (
    <div className="card" style={{
      borderColor: healthy ? 'var(--border-subtle)' : 'rgba(244,63,94,0.3)',
    }}>
      <div className="card-header">
        <div className="flex-center gap-3">
          <div style={{
            width: 34, height: 34, borderRadius: 'var(--radius-sm)',
            background: healthy ? 'var(--blue-dim)' : 'var(--rose-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
            color: healthy ? 'var(--blue)' : 'var(--rose)',
          }}>
            GW
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14 }}>{id}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{target}</p>
          </div>
        </div>
        <HealthBadge status={healthy ? 'healthy' : 'down'} />
      </div>
      <div className="card-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Consec. Failures</p>
            <p style={{ color: consecutiveFailures > 0 ? 'var(--rose)' : 'var(--text-secondary)', fontWeight: 600 }}>
              {consecutiveFailures ?? 0}
            </p>
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Consec. Successes</p>
            <p style={{ color: 'var(--emerald)', fontWeight: 600 }}>{consecutiveSuccesses ?? 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
