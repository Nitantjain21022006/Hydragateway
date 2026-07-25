/**
 * Navigation sidebar component for the monitoring dashboard UI.
 * Provides navigation links to main analytics views and system health pages.
 * Exports Sidebar component.
 */

import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useGateway } from '../../context/GatewayContext';
import {
  LayoutDashboard, Radio, GitBranch, Activity, FileText,
  Zap, ChevronRight, Wifi, WifiOff, Rss
} from 'lucide-react';

const NAV_ITEMS = [
  {
    section: 'Observability',
    items: [
      { to: '/',              label: 'Dashboard',        icon: LayoutDashboard },
      { to: '/requests',     label: 'Live Requests',    icon: Radio,      live: true },
      { to: '/circuit-breakers', label: 'Circuit Breakers', icon: GitBranch },
      { to: '/health',       label: 'Service Health',   icon: Activity },
      { to: '/logs',         label: 'Live Logs',        icon: FileText,   live: true },
      { to: '/kafka',        label: 'Kafka Events',     icon: Rss },
    ],
  },
  {
    section: 'Testing',
    items: [
      { to: '/load-generator', label: 'Load Generator', icon: Zap },
    ],
  },
];

export default function Sidebar({ sseConnected }) {
  const location = useLocation();
  const { gatewayUrl, setGatewayUrl } = useGateway();

  return (
    <aside className="sidebar animate-slide-in">

      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">H</div>
        <div>
          <div className="sidebar-logo-text">HydraGateway</div>
          <div className="sidebar-logo-sub">Observability</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((section) => (
          <div key={section.section}>
            <div className="nav-section-label">{section.section}</div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to);

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`nav-link${isActive ? ' active' : ''}`}
                  end={item.to === '/'}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                  {item.live && (
                    <span className={`nav-badge live`}>
                      <span
                        className="live-dot"
                        style={{ width: 5, height: 5 }}
                      />
                      LIVE
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="flex-center gap-2" style={{ marginBottom: 8 }}>
          {sseConnected ? (
            <><Wifi size={11} style={{ color: 'var(--emerald)' }} />
              <span style={{ color: 'var(--emerald)', fontSize: 11 }}>Stream connected</span></>
          ) : (
            <><WifiOff size={11} style={{ color: 'var(--rose)' }} />
              <span style={{ color: 'var(--rose)', fontSize: 11 }}>Stream offline</span></>
          )}
        </div>

        <div style={{ width: '100%' }}>
          <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4, letterSpacing: '0.5px' }}>
            ACTIVE GATEWAY
          </label>
          <select
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            className="select"
            style={{ 
              width: '100%', 
              padding: '6px 8px', 
              fontSize: 11, 
              height: 30,
              backgroundColor: 'var(--bg-card, #1e1e2e)',
              color: 'var(--text-primary, #cdd6f4)',
              border: '1px solid var(--border, #313244)',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            <option value="http://localhost:3000">Gateway 1 (Port 3000)</option>
            <option value="http://localhost:3001">Gateway 2 (Port 3001)</option>
          </select>
        </div>
      </div>
    </aside>
  );
}
