import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

const GATEWAY_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const INITIAL_CONFIG = {
  endpoint:    '/v1/products',
  method:      'GET',
  total:       100,
  concurrency: 10,
  batchDelay:  200,
  headers:     '{}',
  body:        '',
  authToken:   localStorage.getItem('load_gen_token') || '',
  autoAuth:    true,
  authEmail:   'test@example.com',
  authPassword: 'Password123',
};

const INITIAL_STATS = {
  sent:       0,
  completed:  0,
  failed:     0,
  latencies:  [],
  startTime:  null,
  endTime:    null,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * useLoadGenerator – manages browser-side load test execution.
 *
 * Generates HTTP requests in configurable batches using Promise.allSettled.
 * All requests hit the real gateway, triggering analytics, rate limiters,
 * circuit breakers, and SSE broadcasts.
 *
 * Returns:
 *   config    – current test configuration
 *   setConfig – update config
 *   running   – whether a test is in progress
 *   stats     – live statistics
 *   start     – begin the load test
 *   stop      – abort the load test
 *   results   – individual request results (capped at 1000)
 */
export function useLoadGenerator() {
  const [config,  setConfig]  = useState(INITIAL_CONFIG);
  const [running, setRunning] = useState(false);
  const [stats,   setStats]   = useState(INITIAL_STATS);
  const [results, setResults] = useState([]);
  const [authStatus, setAuthStatus] = useState({ status: 'idle', message: '' });
  const stopFlag = useRef(false);

  const loginOrRegister = useCallback(async (email, password) => {
    setAuthStatus({ status: 'loading', message: 'Authenticating...' });
    try {
      const loginRes = await axios.post(`${GATEWAY_URL}/v1/auth/login`, { email, password }, { timeout: 5000 });
      if (loginRes.status === 200 && loginRes.data?.success) {
        const token = loginRes.data.data.token;
        localStorage.setItem('load_gen_token', token);
        setConfig((c) => ({ ...c, authToken: token }));
        setAuthStatus({ status: 'success', message: `Authenticated as ${email}` });
        return token;
      }
    } catch (loginErr) {
      const errResponse = loginErr.response;
      const isUserNotFound = errResponse && (
        errResponse.status === 401 ||
        errResponse.status === 404 ||
        errResponse.data?.error?.code === 'INVALID_CREDENTIALS' ||
        errResponse.data?.error?.message?.toLowerCase().includes('not found') ||
        errResponse.data?.error?.message?.toLowerCase().includes('invalid')
      );

      if (isUserNotFound) {
        setAuthStatus({ status: 'loading', message: 'User not found. Registering...' });
        try {
          const regRes = await axios.post(`${GATEWAY_URL}/v1/auth/register`, {
            name: 'Load Test User',
            email,
            password
          }, { timeout: 5000 });

          if (regRes.data?.success) {
            const token = regRes.data.data.token;
            localStorage.setItem('load_gen_token', token);
            setConfig((c) => ({ ...c, authToken: token }));
            setAuthStatus({ status: 'success', message: `Registered and Authenticated as ${email}` });
            return token;
          }
        } catch (regErr) {
          const errMsg = regErr.response?.data?.error?.message || regErr.message || 'Registration failed';
          setAuthStatus({ status: 'error', message: `Auth failed: ${errMsg}` });
          throw new Error(`Authentication and Registration failed: ${errMsg}`);
        }
      } else {
        const errMsg = loginErr.response?.data?.error?.message || loginErr.message || 'Login failed';
        setAuthStatus({ status: 'error', message: `Login failed: ${errMsg}` });
        throw new Error(`Login failed: ${errMsg}`);
      }
    }
    throw new Error('Unexpected login resolution');
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem('load_gen_token');
    setConfig((c) => ({ ...c, authToken: '' }));
    setAuthStatus({ status: 'idle', message: '' });
  }, []);

  const updateStats = useCallback((batchResults) => {
    setStats((prev) => {
      const newLatencies = batchResults.map((r) => r.latencyMs).filter(Boolean);
      const newFailed    = batchResults.filter((r) => !r.success).length;
      const newCompleted = batchResults.length;

      return {
        ...prev,
        sent:      prev.sent + newCompleted,
        completed: prev.completed + newCompleted,
        failed:    prev.failed + newFailed,
        latencies: [...prev.latencies, ...newLatencies].slice(-2000),
      };
    });

    setResults((prev) => [...prev, ...batchResults].slice(-1000));
  }, []);

  const start = useCallback(async () => {
    if (running) return;

    stopFlag.current = false;
    setRunning(true);
    setResults([]);
    setStats({
      ...INITIAL_STATS,
      startTime: Date.now(),
    });

    const isProtectedPath = (path) => {
      const publicPrefixes = [
        '/v1/auth/register',
        '/v1/auth/login',
        '/v1/auth/logout',
        '/health',
        '/analytics',
      ];
      return !publicPrefixes.some((prefix) => path.startsWith(prefix));
    };

    let currentToken = config.authToken;
    if (config.autoAuth && isProtectedPath(config.endpoint)) {
      if (!currentToken) {
        try {
          currentToken = await loginOrRegister(config.authEmail, config.authPassword);
        } catch (err) {
          setResults([{
            success: false,
            status: 401,
            latencyMs: 0,
            error: `Auto-Auth pre-flight failed: ${err.message}`,
            timestamp: new Date().toISOString(),
          }]);
          setStats((prev) => ({
            ...prev,
            failed: 1,
            completed: 1,
            endTime: Date.now(),
          }));
          setRunning(false);
          return;
        }
      }
    }

    // Parse config
    let extraHeaders = {};
    try { extraHeaders = JSON.parse(config.headers || '{}'); } catch { extraHeaders = {}; }

    const requestHeaders = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    if (currentToken) {
      requestHeaders['Authorization'] = `Bearer ${currentToken}`;
    }

    const total       = Math.min(Math.max(1, parseInt(config.total, 10)), 10000);
    const concurrency = Math.min(Math.max(1, parseInt(config.concurrency, 10)), 100);
    const delay       = Math.max(0, parseInt(config.batchDelay, 10));

    let sent = 0;

    while (sent < total && !stopFlag.current) {
      const batchSize = Math.min(concurrency, total - sent);

      const batchPromises = Array.from({ length: batchSize }, () => {
        const t0 = Date.now();

        return axios({
          method:  config.method,
          url:     `${GATEWAY_URL}${config.endpoint}`,
          headers: requestHeaders,
          data:    config.body && ['POST', 'PUT', 'PATCH'].includes(config.method)
                   ? (() => { try { return JSON.parse(config.body); } catch { return config.body; } })()
                   : undefined,
          timeout: 10000,
          validateStatus: () => true, // Don't throw on 4xx/5xx
        })
          .then((res) => ({
            success:   res.status < 400,
            status:    res.status,
            latencyMs: Date.now() - t0,
            timestamp: new Date().toISOString(),
          }))
          .catch((err) => ({
            success:   false,
            status:    0,
            latencyMs: Date.now() - t0,
            error:     err.message,
            timestamp: new Date().toISOString(),
          }));
      });

      const batchResults = await Promise.allSettled(batchPromises);
      const settled = batchResults.map((r) =>
        r.status === 'fulfilled' ? r.value : { success: false, latencyMs: 0, error: 'Promise rejected' }
      );

      updateStats(settled);
      sent += batchSize;

      if (delay > 0 && !stopFlag.current) {
        await sleep(delay);
      }
    }

    setStats((prev) => ({ ...prev, endTime: Date.now() }));
    setRunning(false);
  }, [config, running, updateStats, loginOrRegister]);

  const stop = useCallback(() => {
    stopFlag.current = true;
    setRunning(false);
    setStats((prev) => ({ ...prev, endTime: Date.now() }));
  }, []);

  // Derived stats
  const derived = (() => {
    const { sent, completed, failed, latencies, startTime, endTime } = stats;
    const duration  = ((endTime || Date.now()) - (startTime || Date.now())) / 1000;
    const reqPerSec = duration > 0 ? (completed / duration).toFixed(1) : '0.0';
    const successRate = completed > 0 ? (((completed - failed) / completed) * 100).toFixed(1) : '100.0';
    const errorRate   = completed > 0 ? ((failed / completed) * 100).toFixed(1) : '0.0';
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
    const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
    const progress   = config.total > 0 ? Math.min((sent / config.total) * 100, 100) : 0;

    return { reqPerSec, successRate, errorRate, avgLatency, minLatency, maxLatency, progress, duration };
  })();

  return {
    config,
    setConfig,
    running,
    stats,
    derived,
    results,
    start,
    stop,
    authStatus,
    setAuthStatus,
    loginOrRegister,
    clearSession
  };
}
