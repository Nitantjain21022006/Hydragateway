import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Radio, GitBranch, Activity, FileText,
  Zap, ChevronRight, Wifi, WifiOff
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

  return (
    <aside className="sidebar animate-slide-in">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">H</div>
        <div>
          <div className="sidebar-logo-text">HydraGateway</div>
          <div className="sidebar-logo-sub">Observability</div>
        </div>
      </div>

      {/* Nav */}
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

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="flex-center gap-2" style={{ marginBottom: 4 }}>
          {sseConnected ? (
            <><Wifi size={11} style={{ color: 'var(--emerald)' }} />
              <span style={{ color: 'var(--emerald)' }}>Stream connected</span></>
          ) : (
            <><WifiOff size={11} style={{ color: 'var(--rose)' }} />
              <span style={{ color: 'var(--rose)' }}>Stream offline</span></>
          )}
        </div>
        <div>Gateway @ localhost:3000</div>
      </div>
    </aside>
  );
}
