import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import DashboardPage       from './pages/DashboardPage';
import LiveRequestsPage    from './pages/LiveRequestsPage';
import CircuitBreakersPage from './pages/CircuitBreakersPage';
import ServiceHealthPage   from './pages/ServiceHealthPage';
import LiveLogsPage        from './pages/LiveLogsPage';
import LoadGeneratorPage   from './pages/LoadGeneratorPage';

// Track if the main SSE stream is connected (used by sidebar status indicator)
// We use a simple ref-based approach since this is app-wide state
import { useState } from 'react';
import { useSSE } from './hooks/useSSE';

function AppWithSSE() {
  const [sseConnected, setSseConnected] = useState(false);

  // Single SSE connection at app level (heartbeat only) to show sidebar status
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
        </Routes>
      </div>
    </div>
  );
}

export default AppWithSSE;
