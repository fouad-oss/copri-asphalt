import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // .geojson files are served/bundled as static assets (imported with ?url)
  assetsInclude: ['**/*.geojson'],
})
