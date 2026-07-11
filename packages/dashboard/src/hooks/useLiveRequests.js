import { useState, useCallback, useRef } from 'react';
import { useSSE } from './useSSE';
import api from '../services/axios';

const MAX_REQUESTS = 200;

/**
 * useLiveRequests – maintains a sliding window of the last MAX_REQUESTS
 * request records, streaming from GET /analytics/stream (SSE).
 *
 * On mount, fetches the ring buffer snapshot from /analytics/requests/live
 * for immediate display before SSE kicks in.
 */
export function useLiveRequests() {
  const [requests,   setRequests]   = useState([]);
  const [paused,     setPaused]     = useState(false);
  const pausedRef = useRef(false);

  // Keep pausedRef in sync with state for use in SSE callback
  const togglePause = useCallback(() => {
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  }, []);

  const clear = useCallback(() => {
    setRequests([]);
  }, []);

  // Fetch initial snapshot on mount
  const loadInitial = useCallback(async () => {
    try {
      const res = await api.get('/analytics/requests/live?limit=50');
      if (res.data?.success) {
        setRequests(res.data.data.requests || []);
      }
    } catch { /* ignore – SSE will populate */ }
  }, []);

  // Start SSE – load initial data first, then subscribe
  useState(() => { loadInitial(); }, []);

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
