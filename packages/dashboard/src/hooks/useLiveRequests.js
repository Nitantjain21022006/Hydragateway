/**
 * Custom React hook maintaining live request ring buffer state via SSE stream events.
 * Accumulates recent request records for real-time request monitoring views.
 * Exports useLiveRequests custom hook.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSSE } from './useSSE';
import api from '../services/axios';
import { useGateway } from '../context/GatewayContext';

const MAX_REQUESTS = 200;

export function useLiveRequests() {
  const { gatewayUrl } = useGateway();
  const [requests,   setRequests]   = useState([]);
  const [paused,     setPaused]     = useState(false);
  const pausedRef = useRef(false);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  }, []);

  const clear = useCallback(() => {
    setRequests([]);
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      const res = await api.get('/analytics/requests/live?limit=50');
      if (res.data?.success) {
        setRequests(res.data.data.requests || []);
      }
    } catch {  }
  }, []);

  useEffect(() => {
    setRequests([]);
    loadInitial();
  }, [gatewayUrl, loadInitial]);

  const { connected } = useSSE('/analytics/stream', {
    onEvent: (eventName, data) => {
      if (eventName !== 'request') return;
      if (pausedRef.current) return;

      setRequests((prev) => {
        const next = [data, ...prev];
        return next.slice(0, MAX_REQUESTS);
      });
    },
    onOpen: loadInitial,
  });

  return { requests, connected, paused, togglePause, clear };
}
