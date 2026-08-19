import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Puerto estándar de Vite
    // Redirigir todas las rutas al index.html para SPA routing
    historyApiFallback: true,
    // En producción Nginx/Caddy hace este reenvío; en dev lo cubre Vite.
    proxy: {
      '/api': {
        // Con compose.dev.yml el backend queda en 8001 (8000 suele estar ocupado).
        target: process.env.VITE_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  // Asegurar que en preview también funcione
  preview: {
    port: 5173,
  },
})
