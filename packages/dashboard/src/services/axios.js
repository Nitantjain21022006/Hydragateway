/**
 * Pre-configured Axios HTTP client instance for dashboard API calls.
 * Sets base URL and default request headers for dashboard communication.
 * Exports configured Axios instance.
 */

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
