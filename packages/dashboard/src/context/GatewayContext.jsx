import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/axios';

const GatewayContext = createContext();

export const GATEWAY_1_URL = 'http://localhost:3000';
export const GATEWAY_2_URL = 'http://localhost:3001';

export function GatewayProvider({ children }) {
  const [gatewayUrl, setGatewayUrl] = useState(() => {
    return localStorage.getItem('gateway_url') || GATEWAY_1_URL;
  });

  useEffect(() => {
    localStorage.setItem('gateway_url', gatewayUrl);
    api.defaults.baseURL = gatewayUrl;
  }, [gatewayUrl]);

  return (
    <GatewayContext.Provider value={{ gatewayUrl, setGatewayUrl }}>
      {children}
    </GatewayContext.Provider>
  );
}

export function useGateway() {
  const context = useContext(GatewayContext);
  if (!context) {
    throw new Error('useGateway must be used within a GatewayProvider');
  }
  return context;
}
