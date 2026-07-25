/**
 * Entry point for the Vite React frontend dashboard application.
 * Mounts the root App component into the DOM with GatewayProvider context.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { GatewayProvider } from './context/GatewayContext';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <GatewayProvider>
      <App />
    </GatewayProvider>
  </BrowserRouter>
);
