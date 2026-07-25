/**
 * Custom React hook establishing and managing EventSource SSE connections.
 * Handles automatic reconnection, connection state tracking, and event dispatches.
 * Exports useSSE custom hook.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useGateway } from '../context/GatewayContext';

export function useSSE(path, handlers = {}) {
  const { gatewayUrl } = useGateway();
  const [connected, setConnected] = useState(false);
  const esRef          = useRef(null);
  const handlersRef    = useRef(handlers);
  const reconnectTimer = useRef(null);
  const active         = useRef(true);

  handlersRef.current = handlers;

  const connect = useCallback(() => {
    if (!active.current) return;

    const url = `${gatewayUrl}${path}`;

    try {
      const es = new EventSource(url, { withCredentials: false });
      esRef.current = es;

      es.onopen = () => {
        if (!active.current) { es.close(); return; }
        setConnected(true);
        if (handlersRef.current.onOpen) handlersRef.current.onOpen();
      };

      es.onmessage = (e) => {
        if (!active.current) return;
        try {
          const data = JSON.parse(e.data);
          if (handlersRef.current.onMessage) handlersRef.current.onMessage(data);
        } catch {  }
      };

      const namedEvents = ['request', 'circuit_breaker', 'heartbeat', 'connected', 'log'];
      namedEvents.forEach((eventName) => {
        es.addEventListener(eventName, (e) => {
          if (!active.current) return;
          try {
            const data = JSON.parse(e.data);
            if (handlersRef.current.onEvent) {
              handlersRef.current.onEvent(eventName, data);
            }
          } catch {  }
        });
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        if (!active.current) return;

        reconnectTimer.current = setTimeout(() => {
          if (active.current) connect();
        }, 3000);
      };
    } catch (err) {
      setConnected(false);
      reconnectTimer.current = setTimeout(() => {
        if (active.current) connect();
      }, 3000);
    }
  }, [path, gatewayUrl]);

  useEffect(() => {
    active.current = true;
    connect();

    return () => {
      active.current = false;
      clearTimeout(reconnectTimer.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setConnected(false);
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    active.current = false;
    clearTimeout(reconnectTimer.current);
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setConnected(false);
  }, []);

  return { connected, disconnect };
}
