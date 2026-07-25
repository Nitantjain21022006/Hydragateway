/**
 * Custom React hook monitoring circuit breaker state snapshots and live state transitions.
 * Fetches initial circuit breaker state and subscribes to SSE updates.
 * Exports useCircuitBreakers custom hook.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/axios';
import { useSSE } from './useSSE';

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
