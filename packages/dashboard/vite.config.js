/**
 * Vite build and development server configuration file for Dashboard app.
 * Configures React plugin, dev server port, and API proxy routing.
 * Exports Vite configuration object.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
