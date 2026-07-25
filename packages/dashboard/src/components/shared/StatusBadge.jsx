/**
 * Status badge component rendering color-coded state labels for HTTP statuses and service states.
 * Formats status codes and health strings.
 * Exports StatusBadge component.
 */

import React from 'react';

export function MethodBadge({ method }) {
  const m = (method || 'GET').toUpperCase();
  const cls = {
    GET:    'badge-method-get',
    POST:   'badge-method-post',
    PUT:    'badge-method-put',
    DELETE: 'badge-method-delete',
    PATCH:  'badge-method-patch',
  }[m] || 'badge-method-get';

  return <span className={`badge ${cls}`}>{m}</span>;
}

export function StatusBadge({ status }) {
  const code = parseInt(status, 10);
  let cls = 'badge-status-2xx';
  if (code >= 300 && code < 400) cls = 'badge-status-3xx';
  else if (code >= 400 && code < 500) cls = 'badge-status-4xx';
  else if (code >= 500) cls = 'badge-status-5xx';

  return <span className={`badge ${cls}`}>{status}</span>;
}

export function CBStateBadge({ state }) {
  const s = (state || 'CLOSED').toUpperCase();
  const cls = {
    CLOSED:    'badge-cb-closed',
    OPEN:      'badge-cb-open',
    HALF_OPEN: 'badge-cb-half-open',
  }[s] || 'badge-cb-closed';

  return <span className={`badge ${cls}`}>{s.replace('_', ' ')}</span>;
}

export function HealthBadge({ status }) {
  const s = (status || 'healthy').toLowerCase();
  const cls = {
    healthy:  'badge-healthy',
    degraded: 'badge-degraded',
    down:     'badge-down',
  }[s] || 'badge-healthy';

  return <span className={`badge ${cls}`}>{s}</span>;
}
