import React from 'react';
import { Globe, GitBranch, Shield, Gauge, Database, Server, CheckCircle2, XCircle } from 'lucide-react';

function PipelineStep({ icon: Icon, name, detail, status, color }) {
  const isOk  = status === 'ok' || status === 'pass' || status === 'hit' || status === 'authenticated';
  const isFail = status === 'fail' || status === 'open' || status === 'rejected' || status === 'limited' || status === 'error';
  const iconColor = isFail ? 'var(--rose)' : isOk ? 'var(--emerald)' : color || 'var(--blue)';
  const borderColor = isFail ? 'var(--rose)' : isOk ? 'var(--emerald)' : 'var(--border-default)';

  return (
    <div className="pipeline-step">
      <div className="pipeline-icon" style={{ borderColor, color: iconColor }}>
        <Icon size={13} />
      </div>
      <div className="pipeline-content">
        <p className="pipeline-step-name">{name}</p>
        {detail && <p className="pipeline-step-detail">{detail}</p>}
      </div>
    </div>
  );
}

export default function PipelineView({ request }) {
  if (!request) return null;

  const {
    correlationId, method, path, service, statusCode,
    latencyMs, cacheHit, jwtStatus, rateLimitStatus,
    gatewayInstance, timestamp,
  } = request;

  const isFailed = statusCode >= 400;

  const steps = [
    {
      icon:   Globe,
      name:   'Client Request',
      detail: `${method} ${path}`,
      status: 'ok',
      color:  'var(--cyan)',
    },
    {
      icon:   Server,
      name:   'Load Balancer',
      detail: 'Round-robin routing to gateway instance',
      status: 'ok',
      color:  'var(--blue)',
    },
    {
      icon:   Server,
      name:   `Gateway [${gatewayInstance || 'gateway-1'}]`,
      detail: `Correlation ID: ${correlationId || '—'}`,
      status: 'ok',
      color:  'var(--blue)',
    },
    {
      icon:   Shield,
      name:   'JWT Authentication',
      detail: jwtStatus === 'authenticated' ? 'Token verified ✓' :
              jwtStatus === 'rejected'      ? 'Token rejected ✗' :
              'Public route – bypassed',
      status: jwtStatus === 'rejected' ? 'fail' : 'ok',
      color:  'var(--purple)',
    },
    {
      icon:   Gauge,
      name:   'Rate Limiter',
      detail: rateLimitStatus === 'limited' ? 'Rate limit exceeded (429)' : 'Within limit ✓',
      status: rateLimitStatus === 'limited' ? 'fail' : 'ok',
      color:  'var(--amber)',
    },
    {
      icon:   Database,
      name:   'Response Cache',
      detail: cacheHit ? 'Cache HIT – served from Redis' : 'Cache MISS – forwarding to service',
      status: cacheHit ? 'hit' : 'ok',
      color:  'var(--cyan)',
    },
    {
      icon:   GitBranch,
      name:   'Circuit Breaker',
      detail: `Service: ${service || '—'}`,
      status: statusCode >= 503 ? 'open' : 'ok',
      color:  'var(--emerald)',
    },
    {
      icon:   Server,
      name:   `Target: ${service || 'Service'}`,
      detail: `Response: ${statusCode}  ·  Latency: ${latencyMs}ms`,
      status: isFailed ? 'error' : 'ok',
      color:  isFailed ? 'var(--rose)' : 'var(--emerald)',
    },
  ];

  return (
    <div className="pipeline">
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, fontSize: 12 }}>
        <span style={{ color: 'var(--text-muted)' }}>
          {new Date(timestamp).toLocaleTimeString()}
        </span>
        <span style={{ color: isFailed ? 'var(--rose)' : 'var(--emerald)', fontWeight: 600 }}>
          {isFailed ? '✗' : '✓'} HTTP {statusCode}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{latencyMs}ms total</span>
      </div>

      <div className="pipeline-steps">
        {steps.map((step, i) => (
          <PipelineStep key={i} {...step} />
        ))}
      </div>
    </div>
  );
}
