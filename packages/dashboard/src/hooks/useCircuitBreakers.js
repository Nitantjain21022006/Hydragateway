import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/axios';
import { useSSE } from './useSSE';

/**
 * useCircuitBreakers – combines REST polling with SSE state-change events
 * for instant CB visualization.
 *
 * Strategy:
 *   1. On mount: fetch current state from GET /analytics/circuit-breakers
 *   2. Subscribe to SSE /analytics/stream for 'circuit_breaker' events
 *   3. When a CB event arrives, update only that service's state immediately
 *   4. Fallback poll every POLL_INTERVAL_MS to catch any missed events
 */
const POLL_INTERVAL = 5_000;

export function useCircuitBreakers() {
  const [breakers,     setBreakers]     = useState({});
  const [loading,      setLoading]      = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const intervalRef = useRef(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await api.get('/analytics/circuit-breakers');
      if (res.data?.success) {
        setBreakers(res.data.data);
        setLastUpdated(new Date().toLocaleTimeString());
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, []);

  // SSE handler: update specific service state immediately on transition
  const { connected: sseConnected } = useSSE('/analytics/stream', {
    onEvent: (eventName, data) => {
      if (eventName === 'circuit_breaker') {
        setBreakers((prev) => ({
          ...prev,
          [data.service]: {
            ...(prev[data.service] || {}),
            state:           data.state,
            lastTransition:  data.timestamp,
            prevState:       data.prevState,
          },
        }));
        setLastUpdated(new Date().toLocaleTimeString());
      }
    },
  });

  useEffect(() => {
    fetchSnapshot();
    intervalRef.current = setInterval(fetchSnapshot, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchSnapshot]);

  return { breakers, loading, sseConnected, lastUpdated, refresh: fetchSnapshot };
}
