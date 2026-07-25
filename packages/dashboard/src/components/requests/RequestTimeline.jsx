/**
 * Component displaying a timeline feed of recent requests handled by the API Gateway.
 * Shows live request details including correlation IDs, status codes, and latency.
 * Exports RequestTimeline component.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MethodBadge, StatusBadge } from '../shared/StatusBadge';
import PipelineView from './PipelineView';

function getLatencyClass(ms) {
  if (ms < 50)   return 'fast';
  if (ms < 200)  return 'ok';
  if (ms < 1000) return 'slow';
  return 'error';
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour12: false });
  } catch {
    return iso;
  }
}

function truncate(str, n = 30) {
  if (!str) return '—';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

export function RequestRow({ request, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div
        className={`request-row ${expanded ? 'expanded' : ''}`}
        onClick={() => setExpanded((e) => !e)}
        style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
      >

        <span className="request-corr-id" title={request.correlationId}>
          {request.correlationId ? request.correlationId.slice(0, 8) + '…' : '—'}
        </span>

        <MethodBadge method={request.method} />

        <span className="request-path" title={request.path}>
          {truncate(request.path, 40)}
        </span>

        <span style={{ fontSize: 11, color: 'var(--purple)' }}>
          {request.service || '—'}
        </span>

        <StatusBadge status={request.statusCode || request.status || '—'} />

        <span className={`request-latency ${getLatencyClass(request.latencyMs)}`}>
          {request.latencyMs ?? '—'}ms
        </span>

        <span style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'flex-end' }}>
          {expanded
            ? <ChevronDown size={14} />
            : <ChevronRight size={14} />}
        </span>
      </div>

      {expanded && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <PipelineView request={request} />
        </div>
      )}
    </>
  );
}

export default function RequestTimeline({ requests = [] }) {
  if (requests.length === 0) {
    return (
      <div className="empty-state">
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Waiting for requests…
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Send traffic through the gateway to see it here
        </p>
      </div>
    );
  }

  return (
    <div>

      <div className="request-row" style={{
        background: 'var(--bg-elevated)',
        cursor: 'default',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.7px',
        color: 'var(--text-muted)',
        padding: '8px 16px',
      }}>
        <span>Correlation ID</span>
        <span>Method</span>
        <span>Path</span>
        <span>Service</span>
        <span>Status</span>
        <span>Latency</span>
        <span />
      </div>

      {requests.map((req, i) => (
        <RequestRow
          key={req.correlationId + (req.timestamp || i)}
          request={req}
          index={i}
        />
      ))}
    </div>
  );
}
