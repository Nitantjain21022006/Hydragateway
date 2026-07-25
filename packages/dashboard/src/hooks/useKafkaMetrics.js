/**
 * Custom React hook for polling Kafka event metrics from the analytics API.
 * Returns consumed totals, events/sec, per-topic breakdown, and connectivity status.
 * Exports useKafkaMetrics custom hook.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/axios';

const REFRESH_INTERVAL = 5_000;

const EMPTY = {
  connected:      false,
  consumed_total: 0,
  events_per_sec: 0,
  topics:         {},
  events:         {},
  consumer_lag:   {},
  collected_at:   null,
};

export function useKafkaMetrics() {
  const [data,        setData]        = useState(EMPTY);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);
  const prevTotal   = useRef(0);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await api.get('/analytics/kafka');
      if (res.data?.success) {
        const d = res.data.data;
        prevTotal.current = d.consumed_total || 0;
        setData(d);
        setError(null);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch Kafka metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, REFRESH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchMetrics]);

  return { data, loading, error, lastUpdated, refresh: fetchMetrics };
}
