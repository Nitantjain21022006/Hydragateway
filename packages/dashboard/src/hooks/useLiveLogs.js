/**
 * Custom React hook subscribing to Server-Sent Events for real-time gateway log streaming.
 * Maintains log entries state and applies level/service filters.
 * Exports useLiveLogs custom hook.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSSE } from './useSSE';
import { useGateway } from '../context/GatewayContext';

const MAX_LOGS = 300;

export function useLiveLogs(filters = {}) {
  const { gatewayUrl } = useGateway();
  const [logs,    setLogs]    = useState([]);
  const [paused,  setPaused]  = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    setLogs([]);
  }, [gatewayUrl]);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  }, []);

  const clear = useCallback(() => {
    setLogs([]);
  }, []);

  const params = new URLSearchParams();
  if (filters.level)   params.set('level',   filters.level);
  if (filters.service) params.set('service', filters.service);
  const path = `/analytics/logs${params.toString() ? '?' + params.toString() : ''}`;

  const { connected } = useSSE(path, {
    onEvent: (eventName, data) => {
      if (eventName !== 'log') return;
      if (pausedRef.current) return;
      if (data.type !== 'log') return; 

      setLogs((prev) => {
        const next = [...prev, data];
        return next.slice(-MAX_LOGS);
      });
    },
  });

  return { logs, connected, paused, togglePause, clear };
}
