import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/axios';

const POLL_INTERVAL = 5_000;

/**
 * useServiceHealth – polls /health and /lb-health every POLL_INTERVAL ms.
 *
 * Returns merged health data for all services and gateway instances.
 */
export function useServiceHealth() {
  const [services,     setServices]     = useState([]);
  const [gateways,     setGateways]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const intervalRef = useRef(null);

  const fetchHealth = useCallback(async () => {
    try {
      const [gwRes, lbRes] = await Promise.allSettled([
        api.get('/health'),
        api.get('http://localhost:8080/lb-health'),
      ]);

      if (gwRes.status === 'fulfilled' && gwRes.value.data) {
        const data = gwRes.value.data;
        const downstream = data.downstream || {};
        const cbs        = data.circuitBreakers || {};

        const svcList = Object.entries(downstream).map(([name, healthy]) => ({
          name,
          healthy,
          status:   healthy ? 'healthy' : 'down',
          cbState:  cbs[name]?.state || 'CLOSED',
          cbFailures: cbs[name]?.failureCount || 0,
        }));
        setServices(svcList);
      }

      if (lbRes.status === 'fulfilled' && lbRes.value.data) {
        const data = lbRes.value.data;
        setGateways(data.gateways || []);
      }

      setLastUpdated(new Date().toLocaleTimeString());
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    intervalRef.current = setInterval(fetchHealth, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchHealth]);

  return { services, gateways, loading, lastUpdated, refresh: fetchHealth };
}
