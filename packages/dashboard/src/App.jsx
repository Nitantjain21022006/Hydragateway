/**
 * Main React application component establishing router views and primary layout layout structure.
 * Configures route paths for dashboard pages within top-level navigation layout.
 * Exports App component.
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import DashboardPage       from './pages/DashboardPage';
import LiveRequestsPage    from './pages/LiveRequestsPage';
import CircuitBreakersPage from './pages/CircuitBreakersPage';
import ServiceHealthPage   from './pages/ServiceHealthPage';
import LiveLogsPage        from './pages/LiveLogsPage';
import LoadGeneratorPage   from './pages/LoadGeneratorPage';
import KafkaPage           from './pages/KafkaPage';

import { useState } from 'react';
import { useSSE } from './hooks/useSSE';

function AppWithSSE() {
  const [sseConnected, setSseConnected] = useState(false);

  useSSE('/analytics/stream', {
    onOpen:  () => setSseConnected(true),
    onEvent: (name) => {
      if (name === 'connected' || name === 'heartbeat') setSseConnected(true);
    },
  });

  return (
    <div className="app-layout">
      <Sidebar sseConnected={sseConnected} />

      <div className="app-content">
        <Routes>
          <Route path="/"                 element={<DashboardPage />} />
          <Route path="/requests"         element={<LiveRequestsPage />} />
          <Route path="/circuit-breakers" element={<CircuitBreakersPage />} />
          <Route path="/health"           element={<ServiceHealthPage />} />
          <Route path="/logs"             element={<LiveLogsPage />} />
          <Route path="/load-generator"   element={<LoadGeneratorPage />} />
          <Route path="/kafka"            element={<KafkaPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default AppWithSSE;
