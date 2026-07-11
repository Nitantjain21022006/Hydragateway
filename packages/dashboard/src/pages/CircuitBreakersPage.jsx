import React from 'react';
import TopBar from '../components/layout/TopBar';
import LiveIndicator from '../components/shared/LiveIndicator';
import CBServiceCard from '../components/circuit-breaker/CBServiceCard';
import { useCircuitBreakers } from '../hooks/useCircuitBreakers';
import { RefreshCw } from 'lucide-react';

export default function CircuitBreakersPage() {
  const { breakers, loading, sseConnected, lastUpdated, refresh } = useCircuitBreakers();

  const services = Object.keys(breakers);

  // Summary counts
  const openCount     = services.filter((s) => breakers[s]?.state === 'OPEN').length;
  const halfOpenCount = services.filter((s) => breakers[s]?.state === 'HALF_OPEN').length;
  const closedCount   = services.filter((s) => !breakers[s]?.state || breakers[s]?.state === 'CLOSED').length;

  return (
    <>
      <TopBar
        title="Circuit Breakers"
        subtitle="Real-time circuit breaker states for all downstream services"
        lastUpdated={lastUpdated}
        actions={
          <div className="flex-center gap-3">
            <LiveIndicator connected={sseConnected} label="Live state changes" />
            <button className="btn btn-ghost btn-sm" onClick={refresh}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        }
      />

      <main className="page-main animate-fade-in">
        {/* Summary bar */}
        <div className="grid-3" style={{ marginBottom: 20 }}>
          <div className="card" style={{ padding: '14px 18px' }}>
            <div className="flex-center gap-3">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--emerald)', boxShadow: '0 0 8px var(--emerald-glow)' }} />
              <div>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--emerald)' }}>{closedCount}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>CLOSED</p>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: '14px 18px' }}>
            <div className="flex-center gap-3">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--amber)', boxShadow: '0 0 8px var(--amber-glow)' }} />
              <div>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--amber)' }}>{halfOpenCount}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>HALF OPEN</p>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: '14px 18px' }}>
            <div className="flex-center gap-3">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--rose)', boxShadow: '0 0 8px var(--rose-glow)' }} />
              <div>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--rose)' }}>{openCount}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>OPEN</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
            <div className="spinner" /> Loading circuit breaker states…
          </div>
        ) : services.length === 0 ? (
          <div className="empty-state">
            <p style={{ color: 'var(--text-muted)' }}>No circuit breaker data available.</p>
            <p style={{ fontSize: 12 }}>Start the gateway and send some requests.</p>
          </div>
        ) : (
          <div className="grid-2">
            {services.map((name) => (
              <CBServiceCard
                key={name}
                name={name}
                data={breakers[name]}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
