/**
 * Real-time SSE connection status badge component.
 * Displays animated pulse indicator when connected to live data streams.
 * Exports LiveIndicator component.
 */

import React from 'react';

export default function LiveIndicator({ connected, label }) {
  return (
    <div className="flex-center gap-2" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
      <span
        className={`live-dot ${connected ? '' : 'disconnected'}`}
      />
      <span>
        {connected ? (label || 'Live') : 'Disconnected'}
      </span>
    </div>
  );
}
