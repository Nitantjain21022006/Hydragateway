import React from 'react';
import { Activity, XCircle, BarChart3, Clock, TrendingUp, Layers } from 'lucide-react';
import MetricsCard from '../components/shared/MetricsCard';
import TrafficChart from '../components/charts/TrafficChart';
import ResponseTimeChart from '../components/charts/ResponseTimeChart';
import StatusCodeChart from '../components/charts/StatusCodeChart';
import TopBar from '../components/layout/TopBar';
import { useAnalytics } from '../hooks/useAnalytics';

function TopEndpointsTable({ endpoints = [] }) {
  if (!endpoints.length) return null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Top Endpoints</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>by request count</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th style={{ textAlign: 'right' }}>Requests</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((ep, i) => (
              <tr key={i}>
                <td>
                  <span className={`badge badge-method-${ep.method?.toLowerCase()}`}>
                    {ep.method}
                  </span>
                </td>
                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-primary)' }}>
                  {ep.path}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--blue)' }}>
                  {ep.requests?.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServiceBreakdown({ data }) {
  if (!data) return null;
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  if (!entries.length) return null;

  const max = Math.max(...entries.map(([, v]) => v));

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Per-Service Traffic</span>
      </div>
      <div className="card-body">
        {entries.map(([name, count]) => (
          <div key={name} style={{ marginBottom: 12 }}>
            <div className="flex-between" style={{ marginBottom: 5, fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                {name.replace('-service', '')}
              </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {count.toLocaleString()}
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${(count / max) * 100}%`,
                  background: 'linear-gradient(90deg, var(--blue), var(--cyan))',
                  animation: 'none',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { summary, timeline, endpoints, loading, refresh, lastUpdated } = useAnalytics();

  const totalRequests   = summary?.total_requests    || 0;
  const failedRequests  = summary?.failed_requests   || 0;
  const successRate     = summary?.success_rate      || '100.00%';
  const avgResponseTime = summary?.avg_response_time_ms || 0;

  // Build response time data from per-service breakdown
  const responseData = summary?.per_service_breakdown
    ? Object.entries(summary.per_service_breakdown).map(([service, count]) => ({
        service: service.replace('-service', ''),
        time: count,
      }))
    : [];

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle="Real-time gateway analytics overview"
        lastUpdated={lastUpdated}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={refresh}>
            Refresh
          </button>
        }
      />

      <main className="page-main animate-fade-in">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
            <div className="spinner" />
            Loading analytics…
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid-4">
              <MetricsCard
                title="Total Requests"
                value={totalRequests.toLocaleString()}
                icon={Activity}
                accent="blue"
              />
              <MetricsCard
                title="Failed Requests"
                value={failedRequests.toLocaleString()}
                icon={XCircle}
                accent="rose"
                trend={failedRequests > 0 ? 'down' : undefined}
              />
              <MetricsCard
                title="Success Rate"
                value={successRate}
                icon={TrendingUp}
                accent="emerald"
              />
              <MetricsCard
                title="Avg Response Time"
                value={`${avgResponseTime}ms`}
                icon={Clock}
                accent="purple"
              />
            </div>

            {/* Charts row */}
            <div className="grid-2">
              <TrafficChart data={timeline} />
              <ResponseTimeChart data={responseData} />
            </div>

            {/* Second row */}
            <div className="grid-3">
              <StatusCodeChart data={summary?.status_code_breakdown} />
              <ServiceBreakdown data={summary?.per_service_breakdown} />
              <TopEndpointsTable endpoints={endpoints} />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
