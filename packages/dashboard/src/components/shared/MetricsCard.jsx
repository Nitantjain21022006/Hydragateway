import React from 'react';

export default function MetricsCard({ title, value, icon: Icon, trend, accent = 'blue', subtitle }) {
  const accentColor = {
    blue:    'var(--blue)',
    emerald: 'var(--emerald)',
    rose:    'var(--rose)',
    amber:   'var(--amber)',
    purple:  'var(--purple)',
    cyan:    'var(--cyan)',
  }[accent] || 'var(--blue)';

  const accentDim = {
    blue:    'var(--blue-dim)',
    emerald: 'var(--emerald-dim)',
    rose:    'var(--rose-dim)',
    amber:   'var(--amber-dim)',
    purple:  'var(--purple-dim)',
    cyan:    'var(--cyan-dim)',
  }[accent] || 'var(--blue-dim)';

  return (
    <div className="metrics-card">
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="metrics-card-label">{title}</p>
        <p className="metrics-card-value">{value ?? '—'}</p>
        {subtitle && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</p>
        )}
        {trend && (
          <p className="metrics-card-trend" style={{
            color: trend === 'up' ? 'var(--emerald)' : trend === 'down' ? 'var(--rose)' : 'var(--text-muted)'
          }}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '–'} {trend === 'up' ? 'Healthy' : trend === 'down' ? 'Degraded' : ''}
          </p>
        )}
      </div>
      {Icon && (
        <div
          className="metrics-card-icon"
          style={{ background: accentDim }}
        >
          <Icon size={20} style={{ color: accentColor }} />
        </div>
      )}
    </div>
  );
}
