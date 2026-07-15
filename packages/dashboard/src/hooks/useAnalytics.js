import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/axios';
import { useGateway } from '../context/GatewayContext';

const REFRESH_INTERVAL = 30_000;

function formatTimestamp() {
  return new Date().toLocaleTimeString();
}

/**
 * useAnalytics – polls the gateway analytics API every REFRESH_INTERVAL ms.
 *
 * Returns:
 *   summary    – /analytics/summary data
 *   timeline   – /analytics/timeline data
 *   endpoints  – /analytics/endpoints data
 *   loading    – initial load state
 *   error      – last error message
 *   refresh    – manual refresh function
 *   lastUpdated – human-readable timestamp
 */
export function useAnalytics() {
  const { gatewayUrl } = useGateway();
  const [summary,     setSummary]     = useState(null);
  const [timeline,    setTimeline]    = useState([]);
  const [endpoints,   setEndpoints]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [sumRes, tlRes, epRes] = await Promise.allSettled([
        api.get('/analytics/summary'),
        api.get('/analytics/timeline'),
        api.get('/analytics/endpoints?limit=10'),
      ]);

      if (sumRes.status === 'fulfilled' && sumRes.value.data?.success) {
        setSummary(sumRes.value.data.data);
      }
      if (tlRes.status === 'fulfilled' && tlRes.value.data?.success) {
        setTimeline(tlRes.value.data.data?.timeline || []);
      }
      if (epRes.status === 'fulfilled' && epRes.value.data?.success) {
        setEndpoints(epRes.value.data.data?.endpoints || []);
      }

      setError(null);
      setLastUpdated(formatTimestamp());
    } catch (err) {
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchAll, gatewayUrl]);

  return { summary, timeline, endpoints, loading, error, refresh: fetchAll, lastUpdated };
}

