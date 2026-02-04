import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Puerto estándar de Vite
    // Redirigir todas las rutas al index.html para SPA routing
    historyApiFallback: true,
  },
  // Asegurar que en preview también funcione
  preview: {
    port: 5173,
  }
})