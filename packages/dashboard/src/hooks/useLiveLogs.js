import { useState, useCallback, useRef } from 'react';
import { useSSE } from './useSSE';

const MAX_LOGS = 300;

/**
 * useLiveLogs – streams log entries from GET /analytics/logs (SSE).
 *
 * Maintains a sliding window of the last MAX_LOGS entries.
 * Supports pause/resume and clear.
 */
export function useLiveLogs(filters = {}) {
  const [logs,    setLogs]    = useState([]);
  const [paused,  setPaused]  = useState(false);
  const pausedRef = useRef(false);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  }, []);

  const clear = useCallback(() => {
    setLogs([]);
  }, []);

  // Build query string from filters
  const params = new URLSearchParams();
  if (filters.level)   params.set('level',   filters.level);
  if (filters.service) params.set('service', filters.service);
  const path = `/analytics/logs${params.toString() ? '?' + params.toString() : ''}`;

  const { connected } = useSSE(path, {
    onEvent: (eventName, data) => {
      if (eventName !== 'log') return;
      if (pausedRef.current) return;
      if (data.type !== 'log') return; // skip connected/warning system messages

      setLogs((prev) => {
        const next = [...prev, data];
        return next.slice(-MAX_LOGS);
      });
    },
  });

  return { logs, connected, paused, togglePause, clear };
}
