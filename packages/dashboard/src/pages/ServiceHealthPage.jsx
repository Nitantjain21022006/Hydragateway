import React from 'react';
import TopBar from '../components/layout/TopBar';
import ServiceCard, { GatewayCard } from '../components/service-health/ServiceCard';
import { useServiceHealth } from '../hooks/useServiceHealth';
import { RefreshCw } from 'lucide-react';

export default function ServiceHealthPage() {
  const { services, gateways, loading, lastUpdated, refresh } = useServiceHealth();

  const healthyCount = services.filter((s) => s.healthy !== false).length;
  const downCount    = services.filter((s) => s.healthy === false).length;

  return (
    <>
      <TopBar
        title="Service Health"
        subtitle="Health status of all registered downstream services"
        lastUpdated={lastUpdated}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={refresh}>
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      <main className="page-main animate-fade-in">
        {/* Summary */}
        <div className="grid-2" style={{ marginBottom: 20, maxWidth: 400 }}>
          <div className="card" style={{ padding: '14px 18px' }}>
            <div className="flex-center gap-3">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--emerald)' }} />
              <div>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--emerald)' }}>{healthyCount}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>HEALTHY</p>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: '14px 18px' }}>
            <div className="flex-center gap-3">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: downCount > 0 ? 'var(--rose)' : 'var(--text-muted)' }} />
              <div>
                <p style={{ fontSize: 22, fontWeight: 700, color: downCount > 0 ? 'var(--rose)' : 'var(--text-muted)' }}>
                  {downCount}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>DOWN</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
            <div className="spinner" /> Fetching health data…
          </div>
        ) : (
          <>
            {/* Downstream Services */}
            <p className="section-title">Downstream Services</p>
            {services.length === 0 ? (
              <div className="empty-state">
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  No service health data. Is the gateway running?
                </p>
              </div>
            ) : (
              <div className="grid-2" style={{ marginBottom: 24 }}>
                {services.map((svc) => (
                  <ServiceCard key={svc.name} service={svc} />
                ))}
              </div>
            )}

            {/* Gateway Instances */}
            {gateways.length > 0 && (
              <>
                <p className="section-title" style={{ marginTop: 8 }}>Gateway Instances</p>
                <div className="grid-2">
                  {gateways.map((gw) => (
                    <GatewayCard key={gw.id} gateway={gw} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
