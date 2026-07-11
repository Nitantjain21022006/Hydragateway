import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function TopBar({ title, subtitle, actions, lastUpdated }) {
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{title}</div>
        {subtitle && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>

      <div className="topbar-spacer" />

      {lastUpdated && (
        <div className="topbar-status">
          <RefreshCw size={10} style={{ color: 'var(--text-muted)' }} />
          <span>Updated {lastUpdated}</span>
        </div>
      )}

      {actions && (
        <div className="flex-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
