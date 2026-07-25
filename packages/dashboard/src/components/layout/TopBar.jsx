/**
 * Top header bar component displaying live connection status indicators and global controls.
 * Renders system environment status and user navigation header.
 * Exports TopBar component.
 */

import React from 'react';
import { RefreshCw, Radio } from 'lucide-react';
import { useGateway, GATEWAY_1_URL, LOAD_BALANCER_URL } from '../../context/GatewayContext';

export default function TopBar({ title, subtitle, actions, lastUpdated }) {
  const { gatewayUrl } = useGateway();

  const gwLabel = gatewayUrl === GATEWAY_1_URL
    ? 'Gateway 1 · :3000'
    : gatewayUrl === LOAD_BALANCER_URL
      ? 'Load Balancer · :8080'
      : 'Gateway 2 · :3001';

  const gwColor = gatewayUrl === GATEWAY_1_URL
    ? 'var(--blue)'
    : gatewayUrl === LOAD_BALANCER_URL
      ? 'var(--purple)'
      : 'var(--cyan)';

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

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${gwColor}33`,
        background: `${gwColor}11`,
        fontSize: 10,
        color: gwColor,
        fontWeight: 600,
        letterSpacing: '0.4px',
        whiteSpace: 'nowrap',
      }}>
        <Radio size={10} style={{ flexShrink: 0 }} />
        {gwLabel}
      </div>

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
