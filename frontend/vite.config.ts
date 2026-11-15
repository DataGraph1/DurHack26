import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// backend address as seen from the vite server (docker sets this to http://backend:8000)
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  // self-signed https: iPhones only give motion sensors to https pages
  plugins: [react(), basicSsl()],
  server: {
    allowedHosts: ["pi.local"],
    // phones talk to the backend through vite (same origin), so wss:// works over https
    proxy: {
      '/ws': { target: BACKEND_URL, ws: true },
      '/players': BACKEND_URL,
    },
  },
})
