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

